import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/components/status";
import { CreateWorkloadDialog } from "@/components/CreateWorkloadDialog";
import { WorkloadActions } from "@/components/WorkloadActions";
import type { BadgeVariant } from "@/components/ui/badge";

const OBSERVED_STATE_VARIANT: Record<string, BadgeVariant> = {
  unknown: "neutral",
  pending: "info",
  starting: "info",
  running: "success",
  stopping: "info",
  stopped: "neutral",
  failed: "danger",
};

export default async function WorkloadsPage() {
  const [workloads, bots, agents] = await Promise.all([
    db.workload.findMany({
      orderBy: { createdAt: "desc" },
      include: { bot: { select: { name: true } }, assignedAgent: { select: { name: true } } },
    }),
    db.bot.findMany({
      where: { workload: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.agent.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Workloads</h1>
        <CreateWorkloadDialog bots={bots} />
      </div>
      <p className="text-sm text-zinc-500">
        A workload is a validated spec (
        <code className="text-zinc-400">@botfleet/workload-spec</code>) describing how to run a bot,
        plus its desired/observed state on a specific agent. Assigning pushes the spec to the agent
        (<code className="text-zinc-400">bot.update</code>); Start/Stop/ Restart send real commands
        the agent executes as a real OS process - see docs/agent-enrollment.md and docs/roadmap.md.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>All workloads ({workloads.length})</CardTitle>
        </CardHeader>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Bot</th>
              <th className="pb-2 font-medium">Desired</th>
              <th className="pb-2 font-medium">Observed</th>
              <th className="pb-2 font-medium">Assigned agent</th>
              <th className="pb-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {workloads.map((w) => (
              <tr key={w.id}>
                <td className="py-3 text-zinc-200">{w.bot.name}</td>
                <td className="py-3">
                  <Badge variant={w.desiredState === "running" ? "success" : "neutral"}>
                    {formatStatusLabel(w.desiredState)}
                  </Badge>
                </td>
                <td className="py-3">
                  <Badge variant={OBSERVED_STATE_VARIANT[w.observedState] ?? "neutral"}>
                    {formatStatusLabel(w.observedState)}
                  </Badge>
                </td>
                <td className="py-3 text-zinc-400">{w.assignedAgent?.name ?? "—"}</td>
                <td className="py-3">
                  <WorkloadActions
                    workloadId={w.id}
                    assignedAgentId={w.assignedAgentId}
                    agents={agents}
                  />
                </td>
              </tr>
            ))}
            {workloads.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  No workloads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
