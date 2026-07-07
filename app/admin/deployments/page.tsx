import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <h1 className="text-xl font-semibold text-zinc-50">Deployments</h1>
      <p className="text-sm text-zinc-500">
        A record of what&apos;s deployed and when. Nothing here triggers a real deployment yet -
        rollout automation (drain workers, staggered restarts, safe maintenance mode) is on the
        roadmap; see <code className="text-zinc-400">docs/roadmap.md</code>.
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
