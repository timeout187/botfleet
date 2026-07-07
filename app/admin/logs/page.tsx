import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LogsPage() {
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-50">Logs</h1>
      <p className="text-sm text-zinc-500">
        BotFleet&apos;s audit log - every admin action taken through the dashboard or API.
        Bot/worker process-level logs will appear here once a real worker runtime exists to emit
        them.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Audit log (latest 100)</CardTitle>
        </CardHeader>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Actor</th>
              <th className="pb-2 font-medium">Action</th>
              <th className="pb-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="py-2 text-zinc-500">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="py-2 text-zinc-300">{log.actor?.name ?? "system"}</td>
                <td className="py-2 font-mono text-xs text-indigo-300">{log.action}</td>
                <td className="py-2 text-zinc-400">
                  {log.targetType}:{log.targetId}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-zinc-500">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
