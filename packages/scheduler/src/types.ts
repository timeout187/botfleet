export type AgentStatus =
  "enrolling" | "online" | "degraded" | "disconnected" | "draining" | "maintenance" | "disabled";

export interface SchedulerAgent {
  id: string;
  name: string;
  status: AgentStatus;
  region: string | null;
  environment: string | null;
  capabilities: string[];
  labels: Record<string, string>;
  totalMemoryMb: number | null;
  availableMemoryMb: number | null;
  /** Count of workloads currently assigned to this agent (running or
   * not) - used both as a hard cap and as a soft "spread load" signal. */
  currentWorkloadCount: number;
  /** Optional hard cap on workloads per agent. Unset means unbounded. */
  maxWorkloads?: number;
  /** Command failures attributed to this agent in a recent window - the
   * caller decides the window; this package only knows the count. */
  recentFailureCount?: number;
}

export interface SchedulerWorkload {
  id: string;
  customerId: string;
  requiredCapability?: string;
  requiredMemoryMb?: number;
  requiredEnvironment?: string;
  requiredLabels: Record<string, string>;
  preferredLabels: Record<string, string>;
  preferredRegion?: string;
  /** The agent this workload is on today, if any - used for the
   * "minimize unnecessary moves" stability bonus. */
  currentAgentId?: string | null;
}

/** Which agent (if any) already runs a workload for the same customer -
 * used for the customer-spread soft preference. Callers derive this from
 * their own Workload table; this package doesn't know about workloads it
 * wasn't told about. */
export interface CustomerPlacement {
  customerId: string;
  agentId: string;
}

export interface ScoreBreakdownEntry {
  label: string;
  points: number;
}

export interface CandidateScore {
  agentId: string;
  agentName: string;
  eligible: boolean;
  ineligibleReason?: string;
  breakdown: ScoreBreakdownEntry[];
  totalScore: number;
}

export interface PlacementDecision {
  workloadId: string;
  candidates: CandidateScore[];
  selectedAgentId: string | null;
  reason: string;
}
