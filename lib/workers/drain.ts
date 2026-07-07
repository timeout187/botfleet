import { db } from "@/lib/db";
import { WorkerStatus } from "@/app/generated/prisma/client";
import { computeRebalanceRecommendations } from "@/lib/rebalance";
import { setBotWorker } from "@/lib/worker-assignment";
import { writeAuditLog } from "@/lib/audit";

export class WorkerNotFoundError extends Error {}

export interface DrainWorkerResult {
  movedBotIds: string[];
  strandedBotIds: string[];
}

/**
 * Marks a worker as draining, then actually moves every one of its bots
 * onto other online workers with spare capacity - reusing the same
 * rebalance algorithm the read-only recommendations panel uses (a
 * draining worker's effective capacity is 0, so every bot it holds gets a
 * move recommendation; see lib/rebalance.ts). Bots that can't be moved
 * (no online worker has capacity) are left in place and reported as
 * "stranded" so an admin can add capacity and drain again.
 */
export async function drainWorker(
  workerId: string,
  actorUserId: string,
): Promise<DrainWorkerResult> {
  const worker = await db.worker.findUnique({ where: { id: workerId } });
  if (!worker) throw new WorkerNotFoundError(`Worker ${workerId} not found`);

  await db.worker.update({ where: { id: workerId }, data: { status: WorkerStatus.draining } });

  const [allWorkers, allBots] = await Promise.all([
    db.worker.findMany({
      select: { id: true, name: true, maxBots: true, currentBots: true, status: true },
    }),
    db.bot.findMany({ select: { id: true, name: true, workerGroupId: true } }),
  ]);

  const recommendations = computeRebalanceRecommendations(
    allWorkers.map((w) => (w.id === workerId ? { ...w, status: "draining" } : w)),
    allBots,
  ).filter((r) => r.fromWorkerId === workerId);

  const movedBotIds: string[] = [];
  for (const rec of recommendations) {
    await setBotWorker(rec.botId, rec.toWorkerId);
    movedBotIds.push(rec.botId);
  }

  const stillAssigned = await db.bot.findMany({
    where: { workerGroupId: workerId },
    select: { id: true },
  });
  const strandedBotIds = stillAssigned.map((b) => b.id);

  if (strandedBotIds.length === 0) {
    await db.worker.update({ where: { id: workerId }, data: { status: WorkerStatus.offline } });
  }

  await writeAuditLog({
    actorUserId,
    action: "worker.drain",
    targetType: "worker",
    targetId: workerId,
    metadata: { movedBotIds, strandedBotIds },
  });

  return { movedBotIds, strandedBotIds };
}
