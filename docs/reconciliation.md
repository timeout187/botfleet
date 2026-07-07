# Reconciliation

BotFleet's self-healing loop: it compares what each workload *should* be
doing (`Workload.desiredState`) against what it's actually observed to be
doing (`Workload.observedState`), and re-issues a `start`/`stop` command
whenever they disagree. See `docs/scheduler.md` for how a workload gets
assigned to an agent in the first place, and `docs/distributed-audit.md`
for the mission this is Phase 9 of.

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

## The algorithm

For every workload with an assigned agent:

1. If `desiredState === "running"` matches `observedState === "running"`,
   do nothing - they already agree.
2. Otherwise, check for an `AgentCommand` already `pending`/`accepted`
   for this workload. If one exists, skip it this tick (reason: `"a
   command is already in flight"`) - issuing a second command wouldn't be
   corrective, it'd just race the one already running.
3. Otherwise, call `sendWorkloadCommand(workloadId, desiredRunning ?
   "start" : "stop", actorUserId)` - the same function an admin's
   Start/Stop button in `WorkloadActions.tsx` calls. The scheduled job
   calls this with `actorUserId: null`, and the resulting audit log entry
   (`workload.start`/`workload.stop`) reflects that it was a system
   action, not a human one.

`Workload.observedState` itself is only ever written in one place:
`handleCommandResult()` in `lib/agent-gateway/server.ts`, driven by the
agent's own `agent.command_result` message - never guessed at or assumed
by the reconciliation loop itself.

## Verified end-to-end

Against live Postgres + Redis + a real `agent-gateway` process + a real
enrolled `apps/agent` process (not mocked):

- Created a real workload (a `node -e 'setInterval(...)'` process spec),
  assigned it to the real agent (`bot.update` cached the spec).
- Directly desynced the DB row (`desiredState: running`, `observedState:
  stopped`, no in-flight command) to simulate "something changed outside
  the normal command path" - the same shape of gap a control-plane crash
  mid-command or a stale read could leave behind.
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
- 4 integration tests (`apps/control-plane/test/reconciliation.test.ts`)
  exercise all four branches (issue start, issue stop, no-op when
  already agreeing, skip when in-flight) against the real dev Postgres
  database (this repo's established pattern for anything that isn't a
  pure function - see `packages/scheduler`'s tests for the pure-function
  side of the same feature).

## What's explicitly NOT implemented here

Per the mission's own honesty requirement, these are real, disclosed
gaps, not silently missing:

- **Distributed locking across multiple control-plane instances.** Only
  one `worker:ai` process is ever assumed to run today. Two instances
  running this job concurrently could both read the same mismatch before
  either writes a command, and could both call `sendWorkloadCommand` -
  the in-flight check reads-then-acts without a lock around it (a
  textbook TOCTOU race), so a second control-plane process is not safe to
  run yet.
- **Generation-based fencing.** `Workload.generation`/`observedGeneration`
  exist in the schema but aren't consumed by this loop yet - there's no
  way today to tell "the agent is running an old spec version" apart from
  "the agent is running the current one." A stale agent that still thinks
  it owns a workload after an evacuation (see Phase 10, not yet
  implemented) could keep reporting `observedState: running` with nothing
  here to detect the disagreement.
- **Bounded retry/backoff with a terminal failure state.** A workload
  that fails to start every time (bad spec, crashing binary, etc.) is
  retried on every single tick, forever - there's no circuit breaker, no
  backoff, and no "give up and mark this permanently failed" state yet.
  In a real deployment this means a persistently broken workload
  generates a `bot.start` (and its audit log entry) every 30 seconds
  indefinitely.
