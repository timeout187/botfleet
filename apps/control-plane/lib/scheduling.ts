import { db } from "@/lib/db";
import {
  scheduleWorkload,
  type SchedulerAgent,
  type SchedulerWorkload,
  type CustomerPlacement,
  type PlacementDecision,
} from "@botfleet/scheduler";
import { AgentCommandStatus, type Prisma } from "@/app/generated/prisma/client";

const RECENT_FAILURE_WINDOW_MS = 60 * 60 * 1000;

interface WorkloadSpecShape {
  spec?: {
    runner?: { type?: string };
    resources?: { memoryMb?: number };
    placement?: {
      requiredLabels?: Record<string, string>;
      preferredLabels?: Record<string, string>;
    };
  };
}

type WorkloadWithBot = { assignedAgentId: string | null; bot: { customerId: string } };

/**
 * Loads the live agent/workload/recent-failure state and shapes it into
 * `@botfleet/scheduler`'s input types - shared by `computeSchedulingRecommendation`
 * (dry-run recommendations) and `lib/agents/drain.ts` (real relocation
 * during evacuation) so both go through the exact same "what does the
 * fleet look like right now" snapshot logic.
 */
export async function buildSchedulerContext(excludeWorkloadId?: string): Promise<{
  agents: SchedulerAgent[];
  allWorkloads: WorkloadWithBot[];
  customerPlacements: CustomerPlacement[];
}> {
  const [agentRows, allWorkloads, recentFailures] = await Promise.all([
    db.agent.findMany(),
    db.workload.findMany({
      where: {
        assignedAgentId: { not: null },
        ...(excludeWorkloadId ? { id: { not: excludeWorkloadId } } : {}),
      },
      include: { bot: { select: { customerId: true } } },
    }),
    db.agentCommand.groupBy({
      by: ["agentId"],
      where: {
        status: AgentCommandStatus.failed,
        createdAt: { gt: new Date(Date.now() - RECENT_FAILURE_WINDOW_MS) },
      },
      _count: { _all: true },
    }),
  ]);

  const failureCountByAgent = new Map(recentFailures.map((f) => [f.agentId, f._count._all]));

  const agents: SchedulerAgent[] = agentRows.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status as SchedulerAgent["status"],
    region: a.region,
    environment: a.environment,
    capabilities: a.capabilitiesJson as string[],
    labels: a.labelsJson as Record<string, string>,
    totalMemoryMb: a.totalMemoryMb,
    availableMemoryMb: a.availableMemoryMb,
    currentWorkloadCount: allWorkloads.filter((w) => w.assignedAgentId === a.id).length,
    recentFailureCount: failureCountByAgent.get(a.id) ?? 0,
  }));

  const customerPlacements: CustomerPlacement[] = allWorkloads
    .filter((w) => w.assignedAgentId)
    .map((w) => ({ customerId: w.bot.customerId, agentId: w.assignedAgentId! }));

  return { agents, allWorkloads, customerPlacements };
}

export function toSchedulerWorkload(workload: {
  id: string;
  specificationJson: unknown;
  assignedAgentId: string | null;
  bot: { customerId: string };
}): SchedulerWorkload {
  const spec = workload.specificationJson as unknown as WorkloadSpecShape;
  return {
    id: workload.id,
    customerId: workload.bot.customerId,
    requiredCapability: spec.spec?.runner?.type,
    requiredMemoryMb: spec.spec?.resources?.memoryMb,
    requiredLabels: spec.spec?.placement?.requiredLabels ?? {},
    preferredLabels: spec.spec?.placement?.preferredLabels ?? {},
    currentAgentId: workload.assignedAgentId,
  };
}

/**
 * Computes (and records, as a dry-run `PlacementDecision`) a scheduling
 * recommendation for a workload using `@botfleet/scheduler`'s pure
 * scoring function. This never assigns anything itself - automatic
 * scheduling is disabled by design (see docs/scheduler.md); applying a
 * recommendation is a separate, explicit admin action
 * (`POST /api/admin/workloads/:id/assign`).
 */
export async function computeSchedulingRecommendation(
  workloadId: string,
): Promise<{ ok: true; decision: PlacementDecision } | { ok: false; reason: string }> {
  const workload = await db.workload.findUnique({
    where: { id: workloadId },
    include: { bot: { select: { customerId: true } } },
  });
  if (!workload) return { ok: false, reason: "workload not found" };

  const { agents, customerPlacements } = await buildSchedulerContext(workloadId);
  const schedulerWorkload = toSchedulerWorkload(workload);
  const decision = scheduleWorkload(schedulerWorkload, agents, customerPlacements);

  await db.placementDecision.create({
    data: {
      workloadId: decision.workloadId,
      selectedAgentId: decision.selectedAgentId,
      candidateSummaryJson: decision.candidates as unknown as Prisma.InputJsonValue,
      reasonJson: { reason: decision.reason } as Prisma.InputJsonValue,
      simulation: true,
    },
  });

  return { ok: true, decision };
}
