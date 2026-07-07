import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  botStatusVariant,
  workerStatusVariant,
  shardStatusVariant,
  formatStatusLabel,
} from "@/components/status";

export default async function PrivateStatusPage() {
  const [bots, workers, shards] = await Promise.all([
    db.bot.findMany({ include: { customer: true, health: true }, orderBy: { name: "asc" } }),
    db.worker.findMany({ orderBy: { name: "asc" } }),
    db.shard.findMany({ include: { bot: true }, orderBy: [{ botId: "asc" }, { shardId: "asc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Status (internal)</h1>
        <p className="text-sm text-zinc-500">
          Per-customer bot health, per-worker health, and per-shard status. The public,
          customer-safe summary is at <code className="text-zinc-400">/status</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bots by customer</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {bots.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-300">
                {b.customer.name} · {b.name}
              </span>
              <Badge variant={botStatusVariant(b.status)}>{formatStatusLabel(b.status)}</Badge>
            </div>
          ))}
          {bots.length === 0 && <p className="py-4 text-center text-zinc-500">No bots yet.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workers</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {workers.map((w) => (
            <div key={w.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-300">{w.name}</span>
              <Badge variant={workerStatusVariant(w.status)}>{formatStatusLabel(w.status)}</Badge>
            </div>
          ))}
          {workers.length === 0 && (
            <p className="py-4 text-center text-zinc-500">No workers yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shards</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {shards.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-300">
                {s.bot.name} · shard {s.shardId}
              </span>
              <Badge variant={shardStatusVariant(s.status)}>{formatStatusLabel(s.status)}</Badge>
            </div>
          ))}
          {shards.length === 0 && <p className="py-4 text-center text-zinc-500">No shards yet.</p>}
        </div>
      </Card>
    </div>
  );
}
