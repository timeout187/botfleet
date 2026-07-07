import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TriggerDeploymentDialog } from "@/components/TriggerDeploymentDialog";

const STATUS_VARIANT = {
  pending: "neutral",
  in_progress: "info",
  success: "success",
  failed: "danger",
  rolled_back: "warning",
} as const;

export default async function DeploymentsPage() {
  const deployments = await db.deployment.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { deployedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Deployments</h1>
        <TriggerDeploymentDialog />
      </div>
      <p className="text-sm text-zinc-500">
        Triggering a deployment runs every registered plugin&apos;s deployment hooks (see{" "}
        <Link href="/admin/plugins" className="text-indigo-400 hover:text-indigo-300">
          /admin/plugins
        </Link>
        ) and records the result. There&apos;s no process draining or staggered restart behind this
        yet - see <code className="text-zinc-400">docs/roadmap.md</code>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Version</th>
              <th className="pb-2 font-medium">Commit</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Deployed by</th>
              <th className="pb-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {deployments.map((d) => (
              <tr key={d.id}>
                <td className="py-2 text-zinc-200">{d.version}</td>
                <td className="py-2 font-mono text-xs text-zinc-400">{d.commitSha.slice(0, 7)}</td>
                <td className="py-2">
                  <Badge variant={STATUS_VARIANT[d.status]}>{d.status.replace(/_/g, " ")}</Badge>
                </td>
                <td className="py-2 text-zinc-400">{d.deployedBy?.name ?? "—"}</td>
                <td className="py-2 text-zinc-500">
                  {d.startedAt ? new Date(d.startedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {deployments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  No deployments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
