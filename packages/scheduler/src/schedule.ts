import type {
  SchedulerAgent,
  SchedulerWorkload,
  CustomerPlacement,
  CandidateScore,
  ScoreBreakdownEntry,
  PlacementDecision,
} from "./types";

const REGION_MATCH_POINTS = 30;
const PREFERRED_LABEL_POINTS = 10;
const MEMORY_PRESSURE_MAX_POINTS = 20;
const SPREAD_LOAD_MAX_POINTS = 10;
const CUSTOMER_ANTI_AFFINITY_POINTS = 10;
const STABILITY_BONUS_POINTS = 10;
const RECENT_FAILURE_PENALTY_PER_FAILURE = 5;

/**
 * Hard requirements only - an agent failing any of these is never a
 * candidate, regardless of score. Matches the mission's own list:
 * online, not draining, required capabilities/labels, enough memory,
 * workload count below limit, environment restrictions.
 */
function eligibilityFailureReason(
  agent: SchedulerAgent,
  workload: SchedulerWorkload,
): string | null {
  if (agent.status !== "online") {
    return `agent status is "${agent.status}", not online`;
  }
  if (workload.requiredCapability && !agent.capabilities.includes(workload.requiredCapability)) {
    return `missing required capability "${workload.requiredCapability}"`;
  }
  for (const [key, value] of Object.entries(workload.requiredLabels)) {
    if (agent.labels[key] !== value) {
      return `missing required label ${key}=${value}`;
    }
  }
  if (workload.requiredEnvironment && agent.environment !== workload.requiredEnvironment) {
    return `environment "${agent.environment ?? "none"}" does not match required "${workload.requiredEnvironment}"`;
  }
  if (
    workload.requiredMemoryMb !== undefined &&
    agent.availableMemoryMb !== null &&
    agent.availableMemoryMb < workload.requiredMemoryMb
  ) {
    return `insufficient memory (${agent.availableMemoryMb}MB available, ${workload.requiredMemoryMb}MB required)`;
  }
  if (agent.maxWorkloads !== undefined && agent.currentWorkloadCount >= agent.maxWorkloads) {
    return `at capacity (${agent.currentWorkloadCount}/${agent.maxWorkloads} workloads)`;
  }
  return null;
}

function scoreEligibleAgent(
  agent: SchedulerAgent,
  workload: SchedulerWorkload,
  customerPlacements: CustomerPlacement[],
  averageWorkloadCount: number,
): ScoreBreakdownEntry[] {
  const breakdown: ScoreBreakdownEntry[] = [];

  if (workload.preferredRegion && agent.region === workload.preferredRegion) {
    breakdown.push({ label: "preferred region matched", points: REGION_MATCH_POINTS });
  }

  for (const [key, value] of Object.entries(workload.preferredLabels)) {
    if (agent.labels[key] === value) {
      breakdown.push({ label: `preferred label ${key}=${value} matched`, points: PREFERRED_LABEL_POINTS });
    }
  }

  if (agent.totalMemoryMb && agent.availableMemoryMb !== null && agent.totalMemoryMb > 0) {
    const pressure = 1 - agent.availableMemoryMb / agent.totalMemoryMb;
    const points = Math.round((1 - pressure) * MEMORY_PRESSURE_MAX_POINTS);
    breakdown.push({ label: `memory pressure ${(pressure * 100).toFixed(0)}%`, points });
  }

  if (averageWorkloadCount > 0) {
    const relativeLoad = agent.currentWorkloadCount / averageWorkloadCount;
    const points = Math.round(Math.max(0, 1 - relativeLoad) * SPREAD_LOAD_MAX_POINTS);
    if (points > 0) {
      breakdown.push({ label: "below-average workload count", points });
    }
  }

  const hasCustomerNeighbor = customerPlacements.some(
    (p) => p.customerId === workload.customerId && p.agentId === agent.id,
  );
  if (!hasCustomerNeighbor) {
    breakdown.push({ label: "customer anti-affinity (no sibling bot here)", points: CUSTOMER_ANTI_AFFINITY_POINTS });
  }

  if (agent.recentFailureCount) {
    breakdown.push({
      label: `recent failure penalty (${agent.recentFailureCount})`,
      points: -RECENT_FAILURE_PENALTY_PER_FAILURE * agent.recentFailureCount,
    });
  }

  if (workload.currentAgentId === agent.id) {
    breakdown.push({ label: "already running here (avoids an unnecessary move)", points: STABILITY_BONUS_POINTS });
  }

  return breakdown;
}

/**
 * Deterministic, side-effect-free scheduling decision: given a workload
 * and the current agent pool, returns every candidate's eligibility and
 * score breakdown, plus the winner (highest score among eligible
 * candidates; ties broken by agentId for determinism, never by
 * insertion order). Returns `selectedAgentId: null` if no agent is
 * eligible - never throws, never picks an ineligible agent.
 *
 * This function has no side effects and makes no database or network
 * calls - it never moves anything by itself. Automatic scheduling is a
 * caller-side decision (disabled by default - see docs/scheduler.md).
 */
export function scheduleWorkload(
  workload: SchedulerWorkload,
  agents: SchedulerAgent[],
  customerPlacements: CustomerPlacement[] = [],
): PlacementDecision {
  const averageWorkloadCount =
    agents.length > 0
      ? agents.reduce((sum, a) => sum + a.currentWorkloadCount, 0) / agents.length
      : 0;

  const candidates: CandidateScore[] = agents
    .map((agent) => {
      const ineligibleReason = eligibilityFailureReason(agent, workload);
      if (ineligibleReason) {
        return {
          agentId: agent.id,
          agentName: agent.name,
          eligible: false,
          ineligibleReason,
          breakdown: [],
          totalScore: 0,
        };
      }
      const breakdown = scoreEligibleAgent(agent, workload, customerPlacements, averageWorkloadCount);
      const totalScore = breakdown.reduce((sum, entry) => sum + entry.points, 0);
      return { agentId: agent.id, agentName: agent.name, eligible: true, breakdown, totalScore };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.agentId.localeCompare(b.agentId);
    });

  const winner = candidates.find((c) => c.eligible) ?? null;

  return {
    workloadId: workload.id,
    candidates,
    selectedAgentId: winner?.agentId ?? null,
    reason: winner
      ? `Selected ${winner.agentName} with score ${winner.totalScore}`
      : "No eligible agent found",
  };
}
