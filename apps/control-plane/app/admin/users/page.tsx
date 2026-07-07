import { db } from "@/lib/db";
import { auth } from "@/auth";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleSelect } from "@/components/RoleSelect";
import { Role } from "@/app/generated/prisma/client";

export default async function UsersPage() {
  const [session, users] = await Promise.all([
    auth(),
    db.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const isOwner = session?.user?.role === Role.owner;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Users</h1>
        <p className="text-sm text-zinc-500">
          Anyone who has signed in with Discord. Only owners can change roles here - and the last
          remaining owner can never be demoted, so there&apos;s always someone who can fix a
          mistake.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users.length})</CardTitle>
        </CardHeader>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Discord ID</th>
              <th className="pb-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-3 text-zinc-200">{u.name ?? "—"}</td>
                <td className="py-3 font-mono text-xs text-zinc-500">{u.discordUserId ?? "—"}</td>
                <td className="py-3">
                  {isOwner ? (
                    <RoleSelect userId={u.id} currentRole={u.role} />
                  ) : (
                    <Badge variant="info">{u.role}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
