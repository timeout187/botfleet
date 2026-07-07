import { db } from "@/lib/db";
import { sendWorkloadCommand } from "@/lib/workloads";
import { AgentCommandStatus, WorkloadDesiredState } from "@/app/generated/prisma/client";

export interface ReconciliationResult {
  checked: number;
  actionsTriggered: number;
  skipped: { workloadId: string; reason: string }[];
}

/**
 * The core self-healing loop (Phase 9 of docs/distributed-audit.md's
 * mission): compares each assigned workload's `desiredState` against its
 * `observedState` and re-issues a `start`/`stop` command when they
 * disagree - unless a command for that workload is already in flight
 * (`pending`/`accepted`), which would make a second one redundant, not
 * corrective, and could race with the one already running.
 *
 * Explicitly NOT implemented here (see docs/roadmap.md for the honest
 * gap list): distributed locking across multiple control-plane
 * instances (today there's only ever one), generation-based fencing
 * against a stale agent that still thinks it owns a workload after
 * evacuation, and a bounded retry/backoff policy - a workload stuck
 * failing will be retried every reconciliation tick, forever, with no
 * circuit breaker yet.
 */
export async function reconcileWorkloads(actorUserId: string | null): Promise<ReconciliationResult> {
  const workloads = await db.workload.findMany({ where: { assignedAgentId: { not: null } } });
  const result: ReconciliationResult = { checked: workloads.length, actionsTriggered: 0, skipped: [] };

  for (const workload of workloads) {
    const desiredRunning = workload.desiredState === WorkloadDesiredState.running;
    const observedRunning = workload.observedState === "running";
    if (desiredRunning === observedRunning) continue;

    const inFlight = await db.agentCommand.findFirst({
      where: {
        workloadId: workload.id,
        status: { in: [AgentCommandStatus.pending, AgentCommandStatus.accepted] },
      },
    });
    if (inFlight) {
      result.skipped.push({ workloadId: workload.id, reason: "a command is already in flight" });
      continue;
    }

    const command = desiredRunning ? "start" : "stop";
    const sendResult = await sendWorkloadCommand(workload.id, command, actorUserId);
    if (sendResult.ok) {
      result.actionsTriggered++;
    } else {
      result.skipped.push({ workloadId: workload.id, reason: sendResult.reason });
    }
  }

  return result;
}
