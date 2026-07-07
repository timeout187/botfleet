import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { workerStatusVariant, formatStatusLabel } from "@/components/status";
import { CreateWorkerDialog } from "@/components/CreateWorkerDialog";
import { WorkerRestartButton } from "@/components/WorkerRestartButton";
import { computeRebalanceRecommendations } from "@/lib/rebalance";

export default async function WorkersPage() {
  const [workers, bots] = await Promise.all([
    db.worker.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { bots: true } } },
    }),
    db.bot.findMany({ select: { id: true, name: true, workerGroupId: true } }),
  ]);

  const recommendations = computeRebalanceRecommendations(
    workers.map((w) => ({
      id: w.id,
      name: w.name,
      maxBots: w.maxBots,
      currentBots: w.currentBots,
    })),
    bots,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Workers</h1>
        <CreateWorkerDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workers.map((w) => (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle>{w.name}</CardTitle>
              <Badge variant={workerStatusVariant(w.status)}>{formatStatusLabel(w.status)}</Badge>
            </CardHeader>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Mode</dt>
                <dd className="text-zinc-200">{w.mode}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Bots</dt>
                <dd className="text-zinc-200">
                  {w._count.bots} / {w.maxBots}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Memory</dt>
                <dd className="text-zinc-200">{w.memoryMb ?? "—"} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">CPU</dt>
                <dd className="text-zinc-200">{w.cpuPercent ?? "—"}%</dd>
              </div>
            </dl>
            <div className="mt-4">
              <WorkerRestartButton workerId={w.id} />
            </div>
          </Card>
        ))}
        {workers.length === 0 && <p className="text-sm text-zinc-500">No workers yet.</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rebalancing recommendations</CardTitle>
        </CardHeader>
        {recommendations.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Load is balanced - no unassigned bots and no worker is over its max bots.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {recommendations.map((r, i) => (
              <div key={i} className="py-3 text-sm">
                <div className="text-zinc-200">
                  {r.type === "assign" ? "Assign" : "Move"} <strong>{r.botName}</strong>
                  {r.fromWorkerName ? ` from ${r.fromWorkerName}` : ""} to{" "}
                  <strong>{r.toWorkerName}</strong>
                </div>
                <div className="text-xs text-zinc-500">{r.reason}</div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-600">
          Recommendations only - nothing moves automatically. Apply one via a bot&apos;s detail page
          (change its worker assignment) or <code>PATCH /api/admin/bots/:id</code>.
        </p>
      </Card>
    </div>
  );
}
