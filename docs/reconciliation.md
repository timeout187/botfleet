# Reconciliation

BotFleet's self-healing loop: it compares what each workload _should_ be
doing (`Workload.desiredState`) against what it's actually observed to be
doing (`Workload.observedState`), and re-issues a `start`/`stop` command
whenever they disagree. See `docs/scheduler.md` for how a workload gets
assigned to an agent, and `docs/distributed-audit.md` for the mission
this is Phase 9 of (hardened in the v0.1.0 stabilization pass - see
`docs/roadmap.md` and `CHANGELOG.md`).

## How it runs

`reconcileWorkloads()` (`lib/reconciliation.ts`) is scheduled as a BullMQ
repeatable job - `RECONCILE_WORKLOADS_JOB_NAME` in
`lib/queue/scheduler-queue.ts`, registered by `ensureReconciliationScheduled()`,
which the standalone `npm run worker:ai` process calls on startup (same
queue, same worker, same pattern already used for the 5-minute alert
evaluation job - `EVALUATE_ALERTS_JOB_NAME`). It runs every 30 seconds.
It's also directly callable (e.g. from a future admin "reconcile now"
button) since it's just an exported async function, not something
wrapped up inside the job handler.

## Distributed locking

Only one instance may run a reconciliation tick at a time, enforced by a
real cross-process Postgres lock, not an in-process mutex: the whole tick
runs inside `db.$transaction(async (tx) => ...)`, and the first thing it
does is `SELECT pg_try_advisory_xact_lock(847362, 1)`. If a second
control-plane instance's tick overlaps, its lock attempt returns `false`
and it does nothing that tick (`{ lockHeld: true }`) rather than racing
the first instance's in-flight check.

This has to be `pg_try_advisory_xact_lock` (transaction-scoped), not the
session-scoped `pg_advisory_lock`/`pg_advisory_unlock` pair: Prisma pools
connections, so a plain lock/unlock call pair isn't guaranteed to run on
the same physical connection, and an unlock issued on the wrong
connection is a no-op - the lock would appear stuck forever from that
agent's perspective. A transaction-scoped lock is released automatically
when the transaction ends (commit, or any thrown error), on the one
connection Prisma pins for the whole callback, so it can never leak past
a crash mid-tick.

Verified with a real, separate connection: a test transaction takes the
lock and holds it open, then calls `reconcileWorkloads()` from a second,
concurrent connection and confirms it observes `lockHeld: true` and does
zero work; once the holding transaction ends, a normal tick acquires the
lock again (`apps/control-plane/test/reconciliation.test.ts`).

## Ownership fencing (duplicate execution / split-brain prevention)

`Workload.generation` is the fencing token. It's bumped every time a
workload is (re)assigned to an agent (`assignWorkloadToAgent`,
`lib/workloads.ts`) - including reassignment during a drain/evacuation -
and carried on every `bot.start`/`stop`/`restart`/`update` command issued
after that (`@botfleet/protocol`'s `workloadCommandPayload.generation`).

Every agent reports back, alongside each heartbeat, every workload it
currently believes it's running and at what generation
(`agent.inventory` - `apps/agent/src/workload-runner.ts`'s
`getRunningInventory()`). The gateway's `handleInventory()`
(`lib/agent-gateway/server.ts`) compares each reported entry against
`Workload.assignedAgentId`: if the reporting agent isn't the workload's
current owner, it's a stale agent - reassigned away while it was
disconnected, network-partitioned, or otherwise out of contact - and
it's immediately fenced with an unconditional `bot.stop`
(`fenceStaleAgent()`, `lib/workloads.ts`), audited as
`workload.fence_stop`. This is what actually prevents two agents from
running the same workload at once: a stale agent gets caught and stopped
within one heartbeat interval of reconnecting, regardless of whatever the
reconciliation loop is doing for the (correct) current owner.

Verified two ways:

1. `fenceStaleAgent()` records the right `bot.stop` `AgentCommand`
   (targeting the stale agent, not the current owner) with the stale
   generation, and the matching audit log entry
   (`apps/control-plane/test/agents/fencing.test.ts`).
2. **Live, against real infrastructure** - not just unit-tested: enrolled
   a real agent, assigned and started a real workload on it (a real
   `node -e 'setInterval(...)'` child process, confirmed via `ps aux`).
   Reassigned the workload to a different agent directly in the database
   _without_ notifying the original agent - simulating exactly what a
   network partition or a missed message during a drain would leave
   behind. Within one heartbeat interval (~15s), the gateway's log showed
   `fencing agent <id>: reported running workload <id> (generation 2) it
no longer owns`, and the original agent's own log showed
   `[workload ...] exited (code=null, signal=SIGTERM)` - the real process
   was actually killed, confirmed absent from `ps aux` afterward. The
   resulting `AgentCommand` (`bot.stop`, `status: succeeded`, `generation:
2`) and `workload.fence_stop` audit log entry (with `staleAgentId` and
   `staleGeneration`) both matched exactly what the code paths above
   predict.

This is the mission's actual split-brain/duplicate-execution proof: a
workload was never running on two agents at once for more than one
heartbeat interval, and the mechanism that ended the overlap needed no
manual intervention.

## Safe draining and workload evacuation

`drainAgent()` (`lib/agents/drain.ts`, `POST
/api/admin/agents/:id/drain`) marks an agent `draining`, then for every
workload assigned to it:

1. Runs the real `@botfleet/scheduler` scoring function over every other
   agent (the draining one is excluded since it's no longer `online`) to
   pick a relocation target.
2. If none is eligible, the workload is left in place and reported
   **stranded** - the agent stays `draining`, not fully drained, until an
   admin adds capacity and drains again. This mirrors
   `lib/workers/drain.ts`'s established single-node convention exactly.
3. If a target is found: reassigns the workload there
   (`assignWorkloadToAgent` - bumps `generation`, pushes `bot.update`),
   issues `bot.start` if the workload should be running, polls
   `observedState` briefly (up to 5s) for the new agent to confirm it,
   then stops the old agent's copy.

Starting the new copy before stopping the old one favors less downtime
over a brief window where both _could_ be running - which is exactly why
ownership fencing above isn't optional: if the old agent is slow to
receive or act on its stop, its next heartbeat's `agent.inventory` still
gets caught and force-stopped, so the overlap window is bounded, not an
open-ended split-brain.

Once every workload is off the agent, it's marked `disabled` (BotFleet
has no separate "drained" status - `disabled` already means
"administratively taken out of rotation," which is exactly what a fully
evacuated agent is).

Verified: `apps/control-plane/test/agents/drain.test.ts` covers relocating
a stopped workload (and disabling the source agent once empty),
stranding a workload when no eligible agent exists, and relocating a
_running_ workload (issuing both the new agent's `bot.start` and the old
agent's `bot.stop`) - all against the real dev Postgres database and real
BullMQ enqueue, not mocked.

## Bounded retry, backoff, and terminal failure

Every workload-affecting command result (success or failure) updates
`Workload.reconcileAttempts`/`nextReconcileAttemptAt`/
`reconciliationSuspendedAt` in `lib/agent-gateway/server.ts`'s
`markCommandOutcome()` - the same function whether the command actually
ran and failed, or the agent simply wasn't connected to receive it (both
are equally real failures for backoff purposes).

- A success resets `reconcileAttempts` to 0 and clears
  `nextReconcileAttemptAt`.
- A failure increments `reconcileAttempts` and sets
  `nextReconcileAttemptAt` to `now + min(30min, 30s * 2^attempts)`
  (exponential backoff, capped).
- After 5 consecutive failures, the workload is marked
  `reconciliationSuspendedAt` instead - reconciliation stops touching it
  entirely until an admin calls `clearReconciliationFailure()` (`POST
/api/admin/workloads/:id/clear-failure`, a "Clear reconciliation
  failure" button on `/admin/workloads`). This is deliberately never
  automatic - only a human decides a persistently broken workload is
  worth retrying again.

`reconcileWorkloads()` skips any workload with `reconciliationSuspendedAt`
set, or with `nextReconcileAttemptAt` still in the future, before ever
checking desired-vs-observed state.

Verified: `apps/control-plane/test/reconciliation.test.ts` covers a
suspended workload being skipped, a backed-off workload being skipped,
and `clearReconciliationFailure()` resetting both so the very next tick
acts on it again.

## Verified end-to-end (live infrastructure)

Against live Postgres + Redis + a real `agent-gateway` process + a real
enrolled `apps/agent` process (not mocked):

- Created a real workload (a `node -e 'setInterval(...)'` process spec),
  assigned it to the real agent (`bot.update` cached the spec).
- Directly desynced the DB row (`desiredState: running`, `observedState:
stopped`, no in-flight command) to simulate "something changed outside
  the normal command path."
- The scheduled job (running for real, on its real 30s cadence, not
  manually invoked) picked it up on its next tick, issued a real
  `bot.start`, the agent spawned a real child process (confirmed via `ps
aux` showing the actual PID), and `observedState` flipped to `running`
  once the agent's `agent.command_result` arrived.
- Flipped `desiredState` back to `stopped` the same way; the next tick
  issued a real `bot.stop`, the agent sent `SIGTERM` and the process
  actually exited (confirmed via `ps aux` showing no matching process),
  and `observedState` flipped to `stopped`.
- Confirmed the in-flight guard works: while a command was genuinely
  pending, subsequent ticks skipped the workload with reason `"a command
is already in flight"` and did not create a duplicate command.

## What's still explicitly NOT implemented

Per the mission's own honesty requirement:

- **Multi-instance load.** The advisory lock makes concurrent
  control-plane instances _safe_ (no duplicate commands), but there's no
  leader election or work-sharding - every instance still evaluates every
  workload each tick, just only one at a time actually acts. Fine at
  today's scale; would need real partitioning to scale out the
  reconciliation workload itself across many instances.
- **Generation checks on the agent side.** The agent tracks and reports
  its generation but never rejects a stale command based on it - the
  control plane is the sole fencing authority. Out-of-order command
  delivery within a single WebSocket connection isn't a concern in
  practice (TCP + one BullMQ dispatcher per agent connection preserve
  order), but this is a real simplifying assumption, not a proven
  impossibility.
- **Agent-restart recovery of orphaned processes.** If the agent process
  itself crashes and restarts, its in-memory `workloads` map (and
  therefore its `agent.inventory` reports) starts empty - any child
  process that happens to survive the agent's own crash becomes an
  untracked orphan the new agent instance doesn't know about or report.
  Adopting orphaned child processes on agent restart is a real gap, not
  solved here.
