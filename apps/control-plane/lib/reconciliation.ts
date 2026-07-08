import { db } from "@/lib/db";
import { sendWorkloadCommand } from "@/lib/workloads";
import { AgentCommandStatus, WorkloadDesiredState } from "@/app/generated/prisma/client";

export interface ReconciliationResult {
  checked: number;
  actionsTriggered: number;
  skipped: { workloadId: string; reason: string }[];
  /** True if another control-plane instance held the reconciliation lock
   * this tick - this instance did no work at all, not even a read. */
  lockHeld?: boolean;
}

/**
 * A fixed, arbitrary Postgres advisory-lock key pair identifying "the
 * reconciliation tick" - not a table row, just a number every instance
 * agrees on. Two ints (not one bigint) purely for readability; Postgres
 * treats `pg_try_advisory_xact_lock(a, b)` as one combined lock key.
 */
const RECONCILE_LOCK_KEY: [number, number] = [847362, 1];

/**
 * The core self-healing loop (Phase 9 of docs/distributed-audit.md's
 * mission, hardened per docs/reconciliation.md's stabilization pass):
 * compares each assigned workload's `desiredState` against its
 * `observedState` and re-issues a `start`/`stop` command when they
 * disagree - unless a command for that workload is already in flight
 * (`pending`/`accepted`), or it's suspended/backed-off after repeated
 * failures (see the gateway's `markCommandOutcome`).
 *
 * Distributed locking: the whole tick runs inside a Postgres transaction
 * holding `pg_try_advisory_xact_lock` for its duration - if a second
 * control-plane instance's tick overlaps, it fails to acquire the lock
 * and does nothing that tick (`lockHeld: true`), rather than racing the
 * first instance's in-flight check. The lock is released automatically
 * when the transaction ends (commit or throw), so it can never leak past
 * a crash mid-tick - see docs/reconciliation.md for why a transaction-
 * scoped lock (not a session-scoped `pg_advisory_lock`/`unlock` pair) is
 * the only safe choice under Prisma's pooled connections.
 */
export async function reconcileWorkloads(actorUserId: string | null): Promise<ReconciliationResult> {
  return db.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK_KEY[0]}, ${RECONCILE_LOCK_KEY[1]}) AS locked
    `;
    if (!locked) {
      return { checked: 0, actionsTriggered: 0, skipped: [], lockHeld: true };
    }

    const now = new Date();
    const workloads = await tx.workload.findMany({ where: { assignedAgentId: { not: null } } });
    const result: ReconciliationResult = {
      checked: workloads.length,
      actionsTriggered: 0,
      skipped: [],
    };

    for (const workload of workloads) {
      if (workload.reconciliationSuspendedAt) {
        result.skipped.push({
          workloadId: workload.id,
          reason: "reconciliation suspended after repeated failures - needs admin action to clear",
        });
        continue;
      }
      if (workload.nextReconcileAttemptAt && workload.nextReconcileAttemptAt > now) {
        result.skipped.push({ workloadId: workload.id, reason: "backing off after a recent failure" });
        continue;
      }

      const desiredRunning = workload.desiredState === WorkloadDesiredState.running;
      const observedRunning = workload.observedState === "running";
      if (desiredRunning === observedRunning) continue;

      const inFlight = await tx.agentCommand.findFirst({
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
  });
}

/**
 * Clears a workload's suspended/backed-off reconciliation state so it's
 * picked up again on the next tick - the manual "terminal failure state"
 * escape hatch an admin uses after fixing whatever was actually broken
 * (bad spec, crashing binary, etc.). Never called automatically.
 */
export async function clearReconciliationFailure(workloadId: string): Promise<void> {
  await db.workload.update({
    where: { id: workloadId },
    data: { reconcileAttempts: 0, nextReconcileAttemptAt: null, reconciliationSuspendedAt: null },
  });
}
