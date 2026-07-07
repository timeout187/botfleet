import { db } from "@/lib/db";
import { BotStatus, WorkerStatus, AlertSeverity } from "@/app/generated/prisma/client";
import { StatCard } from "@/components/StatCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { botStatusVariant, formatStatusLabel } from "@/components/status";
import { hoursAgo } from "@/lib/time";
import { ensureBuiltinPluginsRegistered, getAllDashboardCards } from "@/lib/plugins";
import Link from "next/link";

export default async function FleetOverviewPage() {
  const since24h = hoursAgo(24);
  ensureBuiltinPluginsRegistered();
  const pluginCards = await Promise.all(getAllDashboardCards().map((c) => c.render()));

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
    recentBots,
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
    db.bot.findMany({ orderBy: { updatedAt: "desc" }, take: 6, include: { customer: true } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-50">Fleet Overview</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total bots" value={totalBots} />
        <StatCard label="Online" value={onlineBots} tone="success" />
        <StatCard label="Failed" value={failedBots} tone={failedBots > 0 ? "danger" : "neutral"} />
        <StatCard label="Disabled" value={disabledBots} />
        <StatCard label="Total guilds" value={guildAgg._sum.guildCount ?? 0} />
        <StatCard label="Total shards" value={shardCount} />
        <StatCard label="Active workers" value={activeWorkers} tone="success" />
        <StatCard label="Memory (MB)" value={memoryAgg._sum.memoryMb ?? 0} />
        <StatCard label="Restart count" value={restartAgg._sum.restartCount ?? 0} />
        <StatCard
          label="Errors (24h)"
          value={errors24h}
          tone={errors24h > 0 ? "danger" : "success"}
        />
        {pluginCards.map((card, i) => (
          <StatCard key={i} label={card.label} value={card.value} tone={card.tone} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently updated bots</CardTitle>
          <Link href="/admin/bots" className="text-xs text-indigo-400 hover:text-indigo-300">
            View all →
          </Link>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {recentBots.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">
              No bots yet.{" "}
              <Link href="/admin/bots" className="text-indigo-400">
                Add your first one
              </Link>
              .
            </p>
          )}
          {recentBots.map((bot) => (
            <Link
              key={bot.id}
              href={`/admin/bots/${bot.id}`}
              className="flex items-center justify-between py-3 text-sm hover:bg-zinc-900/50"
            >
              <div>
                <div className="font-medium text-zinc-200">{bot.name}</div>
                <div className="text-xs text-zinc-500">{bot.customer.name}</div>
              </div>
              <Badge variant={botStatusVariant(bot.status)}>{formatStatusLabel(bot.status)}</Badge>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
