import { db } from "@/lib/db";
import { getRunnerAdapter } from "@/lib/runner";
import { writeAuditLog } from "@/lib/audit";

export class BotNotFoundError extends Error {}

export async function performBotAction(
  botId: string,
  action: "start" | "stop" | "restart",
  actorUserId: string,
): Promise<void> {
  const bot = await db.bot.findUnique({ where: { id: botId }, include: { workerGroup: true } });
  if (!bot) throw new BotNotFoundError(`Bot ${botId} not found`);

  const adapter = getRunnerAdapter(bot.workerGroup?.mode ?? "pm2");
  await adapter[action](botId);

  if (action === "restart") {
    await db.botHealth.update({
      where: { botId },
      data: { restartCount: { increment: 1 } },
    });
  }

  await writeAuditLog({
    actorUserId,
    action: `bot.${action}`,
    targetType: "bot",
    targetId: botId,
  });
}
