import { db } from "@/lib/db";
import { AgentCommandStatus, WorkloadObservedState } from "@/app/generated/prisma/client";

/** Reconciliation backoff (docs/reconciliation.md's "Bounded retry"):
 * after this many consecutive start/stop/restart failures for the same
 * workload, reconciliation stops retrying automatically until an admin
 * clears it (`POST /api/admin/workloads/:id/clear-failure`). */
const MAX_RECONCILE_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

function reconcileBackoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts);
}

export function observedStateFor(
  commandType: string,
  succeeded: boolean,
): WorkloadObservedState | null {
  if (commandType === "bot.update") return null;
  if (!succeeded) return WorkloadObservedState.failed;
  if (commandType === "bot.stop") return WorkloadObservedState.stopped;
  if (commandType === "bot.start" || commandType === "bot.restart") {
    return WorkloadObservedState.running;
  }
  return null;
}

/**
 * Shared by the gateway's `agent.command_result` handler (the agent
 * actually ran the command) and its command dispatcher (the agent wasn't
 * even connected to try) - a dispatch failure is exactly as real a
 * failure as an execution failure for backoff/suspension purposes, so
 * both paths go through the same bookkeeping rather than one silently
 * skipping it. Pulled into its own side-effect-free module (unlike
 * lib/agent-gateway/server.ts, which starts a real HTTP/WS server at
 * import time) specifically so this logic - the only place
 * `Workload.observedState` is ever written - can be unit-tested against
 * the real dev database without also spinning up a socket server.
 */
export async function markCommandOutcome(
  idempotencyKey: string,
  succeeded: boolean,
  safeError: string | null,
): Promise<void> {
  const command = await db.agentCommand.findUnique({ where: { idempotencyKey } });
  if (!command) {
    console.warn(`[agent-gateway] command outcome for unknown idempotencyKey ${idempotencyKey}`);
    return;
  }

  await db.agentCommand.update({
    where: { id: command.id },
    data: succeeded
      ? { status: AgentCommandStatus.succeeded, completedAt: new Date() }
      : { status: AgentCommandStatus.failed, failedAt: new Date(), safeError },
  });

  if (!command.workloadId) return;

  const observedState = observedStateFor(command.commandType, succeeded);
  if (!observedState) return;

  const workload = await db.workload.findUnique({ where: { id: command.workloadId } });
  if (!workload) return;

  // A command's result is only authoritative for `Workload.observedState`
  // if it came from the workload's *current* owner. A stale agent -
  // decommissioned mid-drain, or fenced after a partition - can still
  // have a command in flight (e.g. the explicit "stop the old copy"
  // drainAgent() issues) whose successful result must not be allowed to
  // overwrite state a *different*, currently-assigned agent already
  // reported. The AgentCommand row itself still records the real
  // outcome above; only the fleet-wide authoritative state is guarded.
  if (workload.assignedAgentId !== command.agentId) {
    console.warn(
      `[agent-gateway] ignoring observedState update from ${command.agentId} for workload ${command.workloadId} - no longer its assigned agent (now ${workload.assignedAgentId})`,
    );
    return;
  }

  if (succeeded) {
    await db.workload.update({
      where: { id: command.workloadId },
      data: {
        observedState,
        observedGeneration: workload.generation,
        lastTransitionAt: new Date(),
        reconcileAttempts: 0,
        nextReconcileAttemptAt: null,
      },
    });
    return;
  }

  const attempts = workload.reconcileAttempts + 1;
  const suspended = attempts >= MAX_RECONCILE_ATTEMPTS;
  await db.workload.update({
    where: { id: command.workloadId },
    data: {
      observedState,
      lastTransitionAt: new Date(),
      reconcileAttempts: attempts,
      nextReconcileAttemptAt: suspended
        ? null
        : new Date(Date.now() + reconcileBackoffMs(attempts)),
      reconciliationSuspendedAt: suspended ? new Date() : null,
    },
  });
  if (suspended) {
    console.warn(
      `[agent-gateway] workload ${command.workloadId} suspended from reconciliation after ${attempts} consecutive failures`,
    );
  }
}
