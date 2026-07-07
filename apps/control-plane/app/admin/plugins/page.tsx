import { ensureBuiltinPluginsRegistered, getPlugins, getAllBotTemplates } from "@/lib/plugins";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EvaluateAlertRulesButton } from "@/components/EvaluateAlertRulesButton";

export default async function PluginsPage() {
  ensureBuiltinPluginsRegistered();
  const plugins = getPlugins();
  const templates = getAllBotTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Plugins</h1>
        <p className="text-sm text-zinc-500">
          Plugins can contribute dashboard cards, Security Center checks, alert rules, bot
          templates, and deployment hooks - see{" "}
          <code className="text-zinc-400">lib/plugins/types.ts</code> for the interface. The ones
          below ship with BotFleet; a third-party plugin implementing the same interface plugs into
          the exact same extension points.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered plugins ({plugins.length})</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {plugins.map((p) => (
            <div key={p.id} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium text-zinc-200">{p.name}</div>
                <div className="flex gap-1.5">
                  {p.dashboardCards?.length ? <Badge variant="info">dashboard card</Badge> : null}
                  {p.healthChecks?.length ? <Badge variant="info">health check</Badge> : null}
                  {p.alertRules?.length ? <Badge variant="info">alert rule</Badge> : null}
                  {p.botTemplates?.length ? <Badge variant="info">bot template</Badge> : null}
                  {p.deploymentHooks ? <Badge variant="info">deployment hook</Badge> : null}
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{p.description}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
        </CardHeader>
        <p className="mb-3 text-xs text-zinc-500">
          Evaluated on demand today (a scheduled runner is on the roadmap - see docs/roadmap.md).
        </p>
        <EvaluateAlertRulesButton />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bot templates</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id}>
              <div className="text-sm font-medium text-zinc-200">
                {t.name} <span className="text-xs text-zinc-500">({t.runtime})</span>
              </div>
              <p className="mb-2 text-xs text-zinc-500">{t.description}</p>
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">
                <code>{t.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
