import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { botStatusVariant, formatStatusLabel } from "@/components/status";
import { CreateBotDialog } from "@/components/CreateBotDialog";

export default async function BotsPage() {
  const [bots, customers] = await Promise.all([
    db.bot.findMany({ orderBy: { createdAt: "desc" }, include: { customer: true, health: true } }),
    db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Bots</h1>
        <CreateBotDialog customers={customers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All bots ({bots.length})</CardTitle>
        </CardHeader>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Customer</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Guilds</th>
              <th className="pb-2 font-medium">Shards</th>
              <th className="pb-2 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {bots.map((bot) => (
              <tr key={bot.id} className="cursor-pointer hover:bg-zinc-900/50">
                <td className="py-3">
                  <Link
                    href={`/admin/bots/${bot.id}`}
                    className="font-medium text-zinc-200 hover:text-indigo-400"
                  >
                    {bot.name}
                  </Link>
                </td>
                <td className="py-3 text-zinc-400">{bot.customer.name}</td>
                <td className="py-3">
                  <Badge variant={botStatusVariant(bot.status)}>
                    {formatStatusLabel(bot.status)}
                  </Badge>
                </td>
                <td className="py-3 text-zinc-400">
                  {bot.health?.guildCount ?? 0} / {bot.guildLimit}
                </td>
                <td className="py-3 text-zinc-400">{bot.shardCount}</td>
                <td className="py-3">
                  <Badge variant="info">{bot.plan}</Badge>
                </td>
              </tr>
            ))}
            {bots.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  No bots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
