import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { workerStatusVariant, formatStatusLabel } from "@/components/status";
import { CreateWorkerDialog } from "@/components/CreateWorkerDialog";
import { WorkerRestartButton } from "@/components/WorkerRestartButton";

export default async function WorkersPage() {
  const workers = await db.worker.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bots: true } } },
  });

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
    </div>
  );
}
