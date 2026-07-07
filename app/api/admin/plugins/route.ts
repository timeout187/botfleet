import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ensureBuiltinPluginsRegistered, getPlugins } from "@/lib/plugins";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  ensureBuiltinPluginsRegistered();
  const plugins = getPlugins().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    dashboardCards: (p.dashboardCards ?? []).map((c) => c.id),
    healthChecks: (p.healthChecks ?? []).map((c) => c.id),
    alertRules: (p.alertRules ?? []).map((r) => ({ id: r.id, description: r.description })),
    botTemplates: (p.botTemplates ?? []).map((t) => ({ id: t.id, name: t.name })),
    hasDeploymentHooks: Boolean(p.deploymentHooks),
  }));

  return NextResponse.json({ plugins });
}
