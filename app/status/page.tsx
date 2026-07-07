import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BotStatus, WorkerStatus, AlertSeverity } from "@/app/generated/prisma/client";
import { isMaintenanceModeEnabled } from "@/lib/system-state";

export const dynamic = "force-dynamic";

export default async function PublicStatusPage() {
  const [maintenanceMode, failedBots, offlineWorkers, totalWorkers, openIncidents, recentAlerts] =
    await Promise.all([
      isMaintenanceModeEnabled(),
      db.bot.count({ where: { status: BotStatus.failed } }),
      db.worker.count({ where: { status: WorkerStatus.failed } }),
      db.worker.count(),
      db.alert.count({
        where: { status: "open", severity: { in: [AlertSeverity.error, AlertSeverity.critical] } },
      }),
      db.alert.findMany({
        where: { severity: { in: [AlertSeverity.error, AlertSeverity.critical] } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  const fleetOperational = failedBots === 0;
  const workersOperational = offlineWorkers === 0 || totalWorkers === 0;
  const overallOperational =
    !maintenanceMode && fleetOperational && workersOperational && openIncidents === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 text-zinc-100">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">BotFleet Status</h1>
        <Badge
          variant={maintenanceMode ? "warning" : overallOperational ? "success" : "danger"}
          className="mt-3"
        >
          {maintenanceMode
            ? "Scheduled maintenance"
            : overallOperational
              ? "All systems operational"
              : "Degraded performance"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <div className="space-y-3 text-sm">
          <Row label="Fleet (bots)" ok={fleetOperational} />
          <Row label="Bot workers" ok={workersOperational} />
          <Row label="API" ok />
          <Row label="Database" ok />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident history</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {recentAlerts.map((a) => (
            <div key={a.id} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-200">{a.title}</span>
                <span className="text-xs text-zinc-500">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{a.message}</p>
            </div>
          ))}
          {recentAlerts.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">No incidents recorded.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <Badge variant={ok ? "success" : "danger"}>{ok ? "Operational" : "Degraded"}</Badge>
    </div>
  );
}
