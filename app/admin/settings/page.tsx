import { auth } from "@/auth";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { isEncryptionKeyConfigured } from "@/lib/crypto";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-50">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
        </CardHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Name</dt>
            <dd className="text-zinc-200">{session?.user?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Role</dt>
            <dd className="text-zinc-200">{session?.user?.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Discord user ID</dt>
            <dd className="font-mono text-xs text-zinc-200">{session?.user?.discordUserId}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <p className="text-sm text-zinc-500">
          BotFleet is configured entirely through environment variables (see{" "}
          <code className="text-zinc-300">.env.example</code>) - there&apos;s no in-app settings store
          yet. Additional admins are promoted by adding their Discord user ID to{" "}
          <code className="text-zinc-300">BOTFLEET_ADMIN_DISCORD_IDS</code> and having them sign in
          once.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Encryption key configured</dt>
            <dd className="text-zinc-200">{isEncryptionKeyConfigured() ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
