import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { agentStatusVariant, formatStatusLabel } from "@/components/status";
import { CreateEnrollmentTokenDialog } from "@/components/CreateEnrollmentTokenDialog";
import { AgentDrainButton } from "@/components/AgentDrainButton";

function timeAgo(date: Date | null): string {
  if (!date) return "never";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default async function AgentsPage() {
  const agents = await db.agent.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Agents</h1>
        <CreateEnrollmentTokenDialog />
      </div>
      <p className="text-sm text-zinc-500">
        Remote BotFleet agent processes (<code className="text-zinc-400">apps/agent</code>) that
        have enrolled with this control plane. Each row is a real process that connected outbound
        over the agent gateway (<code className="text-zinc-400">npm run agent-gateway</code>) -
        nothing here is created by hand.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.name}</CardTitle>
              <Badge variant={agentStatusVariant(a.status)}>{formatStatusLabel(a.status)}</Badge>
            </CardHeader>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Hostname</dt>
                <dd className="text-zinc-200">{a.hostname}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Region / Env</dt>
                <dd className="text-zinc-200">
                  {a.region ?? "—"} / {a.environment ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Architecture</dt>
                <dd className="text-zinc-200">{a.architecture}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">CPU</dt>
                <dd className="text-zinc-200">
                  {a.cpuUsagePercent != null ? `${a.cpuUsagePercent.toFixed(1)}%` : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Memory</dt>
                <dd className="text-zinc-200">
                  {a.availableMemoryMb != null && a.totalMemoryMb != null
                    ? `${a.totalMemoryMb - a.availableMemoryMb} / ${a.totalMemoryMb} MB`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Last heartbeat</dt>
                <dd className="text-zinc-200">{timeAgo(a.lastHeartbeatAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Capabilities</dt>
                <dd className="text-right text-zinc-200">
                  {(a.capabilitiesJson as string[]).join(", ")}
                </dd>
              </div>
            </dl>
            {(a.status === "online" || a.status === "degraded" || a.status === "draining") && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <AgentDrainButton agentId={a.id} />
              </div>
            )}
          </Card>
        ))}
        {agents.length === 0 && (
          <p className="text-sm text-zinc-500">
            No agents enrolled yet. Create an enrollment token above, then run{" "}
            <code className="text-zinc-400">npm run agent:dev</code> on a remote machine with{" "}
            <code className="text-zinc-400">BOTFLEET_AGENT_ENROLLMENT_TOKEN</code> set.
          </p>
        )}
      </div>
    </div>
  );
}
