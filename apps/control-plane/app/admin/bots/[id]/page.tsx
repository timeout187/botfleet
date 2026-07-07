import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { botStatusVariant, formatStatusLabel, shardStatusVariant } from "@/components/status";
import { BotActions } from "@/components/BotActions";
import { ChangeWorkerSelect } from "@/components/ChangeWorkerSelect";
import { ExplainCrashButton } from "@/components/ExplainCrashButton";

export default async function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [bot, workers] = await Promise.all([
    db.bot.findUnique({
      where: { id },
      include: { customer: true, health: true, shards: true, workerGroup: true },
    }),
    db.worker.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!bot) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">{bot.name}</h1>
          <p className="text-sm text-zinc-500">
            {bot.customer.name} · client ID {bot.clientId}
          </p>
        </div>
        <Badge variant={botStatusVariant(bot.status)}>{formatStatusLabel(bot.status)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <BotActions botId={bot.id} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Health</CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <Row label="Guilds" value={`${bot.health?.guildCount ?? 0} / ${bot.guildLimit}`} />
            <Row label="Shards" value={String(bot.shardCount)} />
            <Row label="Ping" value={bot.health?.pingMs ? `${bot.health.pingMs}ms` : "—"} />
            <Row label="Memory" value={bot.health?.memoryMb ? `${bot.health.memoryMb} MB` : "—"} />
            <Row label="Restart count" value={String(bot.health?.restartCount ?? 0)} />
            <Row
              label="Last ready"
              value={bot.lastReadyAt ? new Date(bot.lastReadyAt).toLocaleString() : "—"}
            />
            <Row
              label="Last heartbeat"
              value={bot.lastHeartbeatAt ? new Date(bot.lastHeartbeatAt).toLocaleString() : "—"}
            />
            <Row label="Last safe error" value={bot.health?.lastErrorSafe ?? "None"} />
          </dl>
          {bot.health?.lastErrorSafe && (
            <div className="mt-4 border-t border-zinc-900 pt-4">
              <ExplainCrashButton botId={bot.id} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assignment</CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <Row label="Plan" value={bot.plan} />
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <dt className="text-zinc-500">Worker</dt>
              <dd>
                <ChangeWorkerSelect
                  botId={bot.id}
                  currentWorkerId={bot.workerGroupId}
                  workers={workers}
                />
              </dd>
            </div>
            <Row label="Runner mode" value={bot.workerGroup?.mode ?? "pm2 (default)"} />
            <Row label="Created" value={new Date(bot.createdAt).toLocaleString()} />
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shards ({bot.shards.length})</CardTitle>
        </CardHeader>
        {bot.shards.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No shard rows yet - single-process bots don&apos;t need sharding until they approach
            2,500 guilds. See docs/architecture.md.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 font-medium">Shard</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Guilds</th>
                <th className="pb-2 font-medium">Ping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {bot.shards.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.shardId}</td>
                  <td className="py-2">
                    <Badge variant={shardStatusVariant(s.status)}>
                      {formatStatusLabel(s.status)}
                    </Badge>
                  </td>
                  <td className="py-2 text-zinc-400">{s.guildCount}</td>
                  <td className="py-2 text-zinc-400">{s.pingMs ? `${s.pingMs}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-900 pb-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{value}</dd>
    </div>
  );
}
