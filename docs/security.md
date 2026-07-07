# Security

> Source paths below (`lib/`, `next.config.ts`, ...) are relative to
> `apps/control-plane/` - see `docs/distributed-audit.md` for the
> workspace conversion. `docs/threat-model.md` (once it exists) covers
> the distributed control-plane threat model.

## Token vault

Bot tokens (and Discord webhook URLs) are encrypted with AES-256-GCM
(`lib/crypto.ts`) using a 32-byte key from `BOTFLEET_ENCRYPTION_KEY`
(base64-encoded; generate with `openssl rand -base64 32`).

- Encryption/decryption only ever happens inside server-side code
  (route handlers, the seed script). Nothing client-side ever touches a
  plaintext or encrypted token.
- No API response includes `tokenEncrypted` or a webhook's `urlEncrypted` -
  see `lib/serialize.ts`. There is no "masked" version returned either
  (e.g. `sk-***1234`); the field is simply never in the response shape.
- Token rotation (`POST /api/admin/bots/:id/rotate-token`) re-encrypts and
  overwrites in place; the audit log records that a rotation happened, not
  the token.
- Nothing in this codebase calls `console.log`/logs a decrypted secret.
  Grep for `decryptSecret(` if you want to verify this yourself - every
  call site is inside `lib/alerts/discord-webhook.ts` (to actually POST to
  Discord) or a route that discards the value after use.

## AuthN/AuthZ

- **Admin routes** (`/admin/*` pages, `/api/admin/*`): guarded by
  `requireAdmin()` (`lib/require-admin.ts`), which checks
  `session.user.role` is `admin` or `owner`. API routes always return a
  JSON `401`/`403` - never a redirect - so a fetch call never silently
  receives an HTML login page.
- **Customer routes** (`/api/customer/*`): guarded by
  `requireCustomerSession()` + `loadOwnedBot()`
  (`lib/require-customer.ts`). `loadOwnedBot()` returns `null` - and the
  route returns a generic 404 - both when a bot doesn't exist and when it
  exists but belongs to someone else, so bot IDs can't be enumerated to
  distinguish the two cases.
- **First-run admin bootstrap**: `BOTFLEET_ADMIN_DISCORD_IDS` is a
  comma-separated allowlist of Discord user IDs. The first time one of
  those users signs in, `auth.ts`'s `session` callback promotes them to
  `owner`. Additional admins can be promoted afterward at `/admin/users` -
  only an `owner` can change roles there, and the last remaining owner can
  never be demoted (guarded server-side in
  `PATCH /api/admin/users/:id`, not just hidden in the UI).

## Agent enrollment and credentials

See `docs/agent-enrollment.md` for the full flow. Summary of the security
properties:

- Enrollment tokens are single-use (atomically claimed, not read-then-write),
  expiring (30 min default), hashed at rest (SHA-256), and can be scoped to
  an environment/label set.
- **Agent credentials are a disclosed, non-production placeholder: a bearer
  secret, not mutual TLS.** `lib/agents/credential.ts`'s doc comment
  explains exactly why and what a real mTLS upgrade would replace. Do not
  treat this as equivalent to a certificate-based identity for a
  production multi-tenant deployment.
- An unauthenticated agent connection can only ever send one message type
  (`agent.enroll`) - every other message on an unauthenticated socket is
  dropped and logged by `lib/agent-gateway/server.ts`, never processed.
- Every protocol message is replay-guarded by `messageId`
  (`@botfleet/protocol`'s `InMemoryReplayGuard`) and schema-validated
  before any handler runs.

## Content-Security-Policy

Set in `next.config.ts` for every response. `script-src` only allows
`'unsafe-eval'` in development (Next.js Fast Refresh needs it); production
builds get `script-src 'self'` with no eval.

## Security Center

`GET /api/admin/security` (rendered at `/admin/security`) computes a real
report from actual state - see `lib/security-checks.ts`. Every check
either reads an environment variable, queries the database, or reflects a
structural guarantee that's true by construction (e.g. "tokens encrypted
at rest" is true because there is no plaintext token column in the
schema). Nothing is a hardcoded score.

## Known accepted risk

`npm audit` currently reports 2 moderate advisories, both in **build/dev
tooling**, not runtime app code:

- `@hono/node-server` (via Prisma's local `prisma dev` CLI, which this
  project doesn't use - we run against a real Postgres instance).
- `postcss` (bundled inside Next.js's build pipeline).

Both would require downgrading to a much older major version of Prisma or
Next.js to "fix," which is a worse trade than the advisory itself. Revisit
when upstream ships a patched release.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's
private vulnerability reporting (Security tab → "Report a vulnerability")
on this repository.
