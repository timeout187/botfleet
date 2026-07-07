import Link from "next/link";
import { db } from "@/lib/db";
import { isEncryptionKeyConfigured } from "@/lib/crypto";
import { Role } from "@/app/generated/prisma/client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default async function SetupPage() {
  const dbOk = await checkDatabase();
  const encryptionOk = isEncryptionKeyConfigured();
  const oauthOk = Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET);
  const authSecretOk = Boolean(process.env.AUTH_SECRET);
  const adminAllowlistOk = Boolean(process.env.BOTFLEET_ADMIN_DISCORD_IDS);

  let ownerCount = 0;
  let botCount = 0;
  let workerCount = 0;
  if (dbOk) {
    try {
      [ownerCount, botCount, workerCount] = await Promise.all([
        db.user.count({ where: { role: Role.owner } }),
        db.bot.count(),
        db.worker.count(),
      ]);
    } catch {
      // migrations not applied yet - steps below will reflect that
    }
  }

  const steps = [
    {
      title: "1. Configure the database",
      done: dbOk,
      detail: dbOk ? "Connected." : "Set DATABASE_URL in .env and run `npx prisma migrate deploy`.",
    },
    {
      title: "2. Configure the encryption key",
      done: encryptionOk,
      detail: encryptionOk
        ? "BOTFLEET_ENCRYPTION_KEY is set."
        : "Set BOTFLEET_ENCRYPTION_KEY - generate with: openssl rand -base64 32",
    },
    {
      title: "3. Configure Discord OAuth",
      done: oauthOk && authSecretOk,
      detail:
        oauthOk && authSecretOk
          ? "AUTH_DISCORD_ID/SECRET and AUTH_SECRET are set."
          : "Create a Discord app, set AUTH_DISCORD_ID/AUTH_DISCORD_SECRET, and AUTH_SECRET (openssl rand -base64 32).",
    },
    {
      title: "4. Allowlist your Discord user ID as owner",
      done: adminAllowlistOk,
      detail: adminAllowlistOk
        ? "BOTFLEET_ADMIN_DISCORD_IDS is set."
        : "Set BOTFLEET_ADMIN_DISCORD_IDS to your Discord user ID (comma-separated for more than one).",
    },
    {
      title: "5. Create your admin account",
      done: ownerCount > 0,
      detail:
        ownerCount > 0
          ? `${ownerCount} owner account(s) exist.`
          : "Sign in with Discord - the first allowlisted user is promoted automatically.",
      action:
        ownerCount === 0 && dbOk && oauthOk && authSecretOk
          ? { href: "/login", label: "Sign in" }
          : undefined,
    },
    {
      title: "6. Choose a runner mode (PM2 or Docker)",
      done: workerCount > 0,
      detail:
        workerCount > 0
          ? `${workerCount} worker(s) configured.`
          : "Picked per-worker when you create one - no global setting needed.",
      action: ownerCount > 0 ? { href: "/admin/workers", label: "Add a worker" } : undefined,
    },
    {
      title: "7. Add your first bot",
      done: botCount > 0,
      detail:
        botCount > 0
          ? `${botCount} bot(s) registered.`
          : "Add a bot and its token (encrypted at rest).",
      action: ownerCount > 0 ? { href: "/admin/bots", label: "Add a bot" } : undefined,
    },
    {
      title: "8. Verify health",
      done: false,
      detail: "Check the Fleet Overview and Security Center once everything above is done.",
      action: ownerCount > 0 ? { href: "/admin", label: "Open dashboard" } : undefined,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 text-zinc-100">
      <div>
        <h1 className="text-2xl font-semibold">BotFleet setup</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A first-run checklist - everything here reflects real, live state (env vars and the
          database), not a canned flow.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {steps.map((step) => (
            <div key={step.title} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <div className="font-medium text-zinc-200">{step.title}</div>
                <div className="text-xs text-zinc-500">{step.detail}</div>
              </div>
              <div className="flex items-center gap-2">
                {step.action && (
                  <Link
                    href={step.action.href}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    {step.action.label} →
                  </Link>
                )}
                <Badge variant={step.done ? "success" : "neutral"}>
                  {step.done ? "Done" : "Pending"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-center text-xs text-zinc-600">
        Full reference: <code className="text-zinc-500">.env.example</code> and{" "}
        <Link href="/admin/security" className="text-indigo-400 hover:text-indigo-300">
          the Security Center
        </Link>{" "}
        once you&apos;re signed in.
      </p>
    </div>
  );
}
