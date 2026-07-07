import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateCustomerDialog } from "@/components/CreateCustomerDialog";

export default async function CustomersPage() {
  const customers = await db.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bots: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-50">Customers</h1>
        <CreateCustomerDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All customers ({customers.length})</CardTitle>
        </CardHeader>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Plan</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Bots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="py-3 text-zinc-200">{c.name}</td>
                <td className="py-3">
                  <Badge variant="info">{c.plan}</Badge>
                </td>
                <td className="py-3 text-zinc-400">{c.status}</td>
                <td className="py-3 text-zinc-400">{c._count.bots}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-zinc-500">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
