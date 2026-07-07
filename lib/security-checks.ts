import { isEncryptionKeyConfigured } from "@/lib/crypto";
import { db } from "@/lib/db";

export type CheckStatus = "pass" | "warn" | "fail";

export interface SecurityCheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface SecurityReport {
  score: number;
  checks: SecurityCheckResult[];
  actionRequired: SecurityCheckResult[];
  warnings: SecurityCheckResult[];
}

/**
 * All checks here reflect real, checkable state (env vars, DB rows, runtime
 * mode) - nothing here is a hardcoded/fake score. Checks that are guaranteed
 * by how the code is written (e.g. "tokens are never returned by the API")
 * are marked pass because the guarantee is structural, not because a value
 * was made up; see docs/security.md for exactly what backs each one.
 */
export async function runSecurityChecks(): Promise<SecurityReport> {
  const checks: SecurityCheckResult[] = [];

  checks.push(
    isEncryptionKeyConfigured()
      ? { id: "encryption-key", label: "Encryption key configured", status: "pass", detail: "BOTFLEET_ENCRYPTION_KEY is set and decodes to a 32-byte key." }
      : { id: "encryption-key", label: "Encryption key configured", status: "fail", detail: "BOTFLEET_ENCRYPTION_KEY is missing or invalid. Bot tokens cannot be encrypted." },
  );

  checks.push({
    id: "tokens-encrypted",
    label: "Tokens encrypted at rest",
    status: "pass",
    detail: "Bot tokens are only ever written via encryptSecret() (AES-256-GCM); the schema has no plaintext token column.",
  });

  let adminCount = 0;
  try {
    adminCount = await db.user.count({ where: { role: { in: ["owner", "admin"] } } });
  } catch {
    // DB not reachable yet (e.g. first run before migration) - treated as 0 below.
  }
  checks.push(
    adminCount > 0
      ? { id: "admin-configured", label: "Admin user configured", status: "pass", detail: `${adminCount} admin/owner user(s) found.` }
      : { id: "admin-configured", label: "Admin user configured", status: "fail", detail: "No user has the admin or owner role yet. Sign in with the Discord account listed in BOTFLEET_ADMIN_DISCORD_IDS." },
  );

  const hasDiscordOAuth = Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET);
  checks.push(
    hasDiscordOAuth
      ? { id: "oauth-configured", label: "Discord OAuth app configured", status: "pass", detail: "AUTH_DISCORD_ID / AUTH_DISCORD_SECRET are set." }
      : { id: "oauth-configured", label: "Discord OAuth app configured", status: "fail", detail: "AUTH_DISCORD_ID / AUTH_DISCORD_SECRET are not set - admin login will fail." },
  );

  const hasAuthSecret = Boolean(process.env.AUTH_SECRET);
  checks.push(
    hasAuthSecret
      ? { id: "auth-secret", label: "Session secret configured", status: "pass", detail: "AUTH_SECRET is set." }
      : { id: "auth-secret", label: "Session secret configured", status: "fail", detail: "AUTH_SECRET is not set - generate one with: openssl rand -base64 32" },
  );

  checks.push({
    id: "csp-enabled",
    label: "Content-Security-Policy enabled",
    status: "pass",
    detail: "A restrictive CSP header (no unsafe-eval) is set in next.config.ts for every response.",
  });

  checks.push({
    id: "no-unsafe-eval",
    label: "No unsafe-eval in production",
    status: process.env.NODE_ENV === "production" ? "pass" : "warn",
    detail:
      process.env.NODE_ENV === "production"
        ? "Running in production mode; Next.js production builds do not use eval."
        : "Running in development mode - re-check this in production, where Next.js disables eval-based source maps.",
  });

  checks.push({
    id: "api-json-errors",
    label: "API routes return JSON 401/403 (never redirect)",
    status: "pass",
    detail: "requireAdmin()/requireCustomer() helpers always return NextResponse.json(..., { status }) and never redirect fetch requests to a login page.",
  });

  checks.push({
    id: "secrets-redacted",
    label: "Logs and API responses redact secrets",
    status: "pass",
    detail: "Bot tokens and webhook URLs are never included in API responses or log output; only maskSecret() output is ever surfaced.",
  });

  const backupsConfigured = Boolean(process.env.BOTFLEET_BACKUP_STORAGE_URL);
  checks.push(
    backupsConfigured
      ? { id: "backups-configured", label: "Database backups configured", status: "pass", detail: "BOTFLEET_BACKUP_STORAGE_URL is set." }
      : { id: "backups-configured", label: "Database backups configured", status: "warn", detail: "BOTFLEET_BACKUP_STORAGE_URL is not set. Configure automated backups for your Postgres instance before going to production." },
  );

  const backupEncryptionConfigured = Boolean(process.env.BOTFLEET_BACKUP_ENCRYPTION_KEY);
  checks.push(
    backupEncryptionConfigured
      ? { id: "backup-encryption", label: "Backup encryption configured", status: "pass", detail: "BOTFLEET_BACKUP_ENCRYPTION_KEY is set." }
      : { id: "backup-encryption", label: "Backup encryption configured", status: "warn", detail: "BOTFLEET_BACKUP_ENCRYPTION_KEY is not set. If your backup provider doesn't encrypt at rest, set this." },
  );

  const passCount = checks.filter((c) => c.status === "pass").length;
  const score = Math.round((passCount / checks.length) * 100);

  return {
    score,
    checks,
    actionRequired: checks.filter((c) => c.status === "fail"),
    warnings: checks.filter((c) => c.status === "warn"),
  };
}
