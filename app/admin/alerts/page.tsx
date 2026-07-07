import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { alertSeverityVariant, formatStatusLabel } from "@/components/status";
import { CreateWebhookDialog } from "@/components/CreateWebhookDialog";
import { WebhookRowActions } from "@/components/WebhookRowActions";

export default async function AlertsPage() {
  const [webhooks, alerts] = await Promise.all([
    db.webhookDestination.findMany({ orderBy: { createdAt: "desc" } }),
    db.alert.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Alerts</h1>
        <CreateWebhookDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discord webhook destinations</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {webhooks.map((w) => (
            <div key={w.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium text-zinc-200">{w.name}</div>
                <div className="text-xs text-zinc-500">
                  {w.lastSuccessAt
                    ? `Last sent ${new Date(w.lastSuccessAt).toLocaleString()}`
                    : "Never sent"}
                </div>
              </div>
              <WebhookRowActions webhookId={w.id} />
            </div>
          ))}
          {webhooks.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">
              No webhook destinations configured. Alerts have nowhere to go until you add one.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent alerts</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium text-zinc-200">{a.title}</div>
                <div className="text-xs text-zinc-500">{a.message}</div>
              </div>
              <Badge variant={alertSeverityVariant(a.severity)}>{formatStatusLabel(a.severity)}</Badge>
            </div>
          ))}
          {alerts.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">No alerts yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
