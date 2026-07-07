import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { BotStatus, WorkerStatus, AlertSeverity } from "@/app/generated/prisma/client";
import { hoursAgo } from "@/lib/time";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const since24h = hoursAgo(24);

  const [
    totalBots,
    onlineBots,
    failedBots,
    disabledBots,
    guildAgg,
    shardCount,
    activeWorkers,
    memoryAgg,
    restartAgg,
    errors24h,
  ] = await Promise.all([
    db.bot.count(),
    db.bot.count({ where: { status: BotStatus.online } }),
    db.bot.count({ where: { status: BotStatus.failed } }),
    db.bot.count({ where: { status: BotStatus.disabled } }),
    db.botHealth.aggregate({ _sum: { guildCount: true } }),
    db.shard.count(),
    db.worker.count({ where: { status: WorkerStatus.online } }),
    db.worker.aggregate({ _sum: { memoryMb: true } }),
    db.botHealth.aggregate({ _sum: { restartCount: true } }),
    db.alert.count({
      where: {
        createdAt: { gte: since24h },
        severity: { in: [AlertSeverity.error, AlertSeverity.critical] },
      },
    }),
  ]);

  return NextResponse.json({
    totalBots,
    onlineBots,
    failedBots,
    disabledBots,
    totalGuilds: guildAgg._sum.guildCount ?? 0,
    totalShards: shardCount,
    activeWorkers,
    memoryUsageMb: memoryAgg._sum.memoryMb ?? 0,
    restartCount: restartAgg._sum.restartCount ?? 0,
    errorsLast24h: errors24h,
  });
}
