# Scheduler

How BotFleet decides which agent a workload *should* run on. See
`docs/reconciliation.md` for what actually happens once a workload is
assigned, and `docs/distributed-audit.md` for the mission this is Phase 8
of.

## It only recommends - it never assigns

`@botfleet/scheduler`'s `scheduleWorkload()` (`packages/scheduler/src/schedule.ts`)
is a pure function: given a workload, the current agents, and the current
customer-to-agent placements, it returns a `PlacementDecision` - a ranked
list of candidates with eligibility and a score breakdown, and which one
(if any) it would pick. It has no database access, makes no network
calls, and never moves anything itself.

`lib/scheduling.ts`'s `computeSchedulingRecommendation(workloadId)` is the
only caller: it loads the real agents/workloads/recent-failure counts from
Postgres, calls the pure function, and records the result as a
`PlacementDecision` row with `simulation: true`. That's it - **automatic
scheduling is disabled by design**. `POST
/api/admin/workloads/:id/schedule` (`WorkloadActions.tsx`'s "Get
recommendation" button) only ever calls this dry-run path. An admin still
has to click "Assign" to actually call `assignWorkloadToAgent()`
(`lib/workloads.ts`) with the recommended (or any other) agent.

## Hard requirements (eligibility)

An agent is filtered out entirely - never scored - if any of these fail
(`eligibilityFailureReason()`):

- `status !== "online"` (an enrolling/degraded/disconnected/draining/
  maintenance/disabled agent is never eligible)
- missing a capability the workload's `runner.type` requires
- missing any of the workload's `requiredLabels`
- insufficient `availableMemoryMb` for the workload's `resources.memoryMb`
- already at `maxWorkloads` (if set)
- `requiredEnvironment` set and the agent's `environment` doesn't match

If no agent survives these filters, `selectedAgentId` is `null` and
`reason` is `"No eligible agent found"` - the decision is still recorded
(so there's a real history of "we tried and couldn't place this"), it
just picks nothing.

## Soft preferences (scoring)

Eligible agents are scored and ranked (`scoreEligibleAgent()`):

| Preference | Points | Why |
|---|---|---|
| Region match (`preferredRegion`) | 30 | Latency/data-locality preference, not a hard rule |
| Preferred label match | 10 each | Workload-declared soft affinity |
| Memory headroom | up to 20 | Prefers agents with more free capacity, scaled by pressure |
| Fewer current workloads | up to 10 | Spreads load rather than always picking the same agent |
| Customer anti-affinity | 10 | Avoids co-locating two workloads from the same customer on one agent |
| Stability bonus | 10 | If the workload already has a `currentAgentId` and it's still eligible, prefer staying put over an unnecessary move |
| Recent failure penalty | -5 per failure | Agents with `AgentCommand` failures in the last hour (`RECENT_FAILURE_WINDOW_MS`) in `lib/scheduling.ts`) are penalized, not excluded |

Ties are broken deterministically by `agentId.localeCompare()` - the same
input always produces the same output, which is what makes this testable
without any live infrastructure (16 unit tests, `packages/scheduler/test/schedule.test.ts`,
covering every hard filter individually, an ineligible-agent-never-wins
case, every soft preference individually, deterministic tie-breaking, and
a full score-breakdown readability check - all pass, no DB/network
involved).

## What's not implemented

- **Automatic scheduling.** There is no "enable auto-assign" toggle yet -
  every placement is admin-applied, always. If/when this ships, it must
  default to off (per the mission's own requirement) and probably wants
  its own audited on/off flag rather than being silently always-on.
- **Bin-packing across multiple workloads at once.** Each call scores one
  workload in isolation; there's no batch/global optimization pass.
- **Placement history UI.** `PlacementDecision` rows are recorded but
  there's no `/admin/scheduler` page listing past recommendations yet -
  only the most recent one, shown inline on the workload it was computed
  for (`WorkloadActions.tsx`).
