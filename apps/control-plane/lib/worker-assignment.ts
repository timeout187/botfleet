import { db } from "@/lib/db";
import { AssignmentStatus } from "@/app/generated/prisma/client";

/**
 * The single place that changes a bot's worker assignment. Keeps
 * `Worker.currentBots` (a cached counter used for fast load display) and the
 * `WorkerAssignment` join table in sync with `Bot.workerGroupId` - drifting
 * these apart was a real bug caught while wiring up rebalancing recommendations.
 */
export async function setBotWorker(botId: string, newWorkerId: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const bot = await tx.bot.findUniqueOrThrow({
      where: { id: botId },
      select: { workerGroupId: true },
    });
    const oldWorkerId = bot.workerGroupId;
    if (oldWorkerId === newWorkerId) return;

    if (oldWorkerId) {
      await tx.worker.update({
        where: { id: oldWorkerId },
        data: { currentBots: { decrement: 1 } },
      });
      await tx.workerAssignment.updateMany({
        where: { workerId: oldWorkerId, botId, status: AssignmentStatus.active },
        data: { status: AssignmentStatus.removed },
      });
    }

    if (newWorkerId) {
      await tx.worker.update({
        where: { id: newWorkerId },
        data: { currentBots: { increment: 1 } },
      });
      await tx.workerAssignment.create({
        data: { workerId: newWorkerId, botId, status: AssignmentStatus.active },
      });
    }

    await tx.bot.update({ where: { id: botId }, data: { workerGroupId: newWorkerId } });
  });
}
