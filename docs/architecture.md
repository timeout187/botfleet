# Architecture

BotFleet is a single Next.js 16 (App Router) application backed by
PostgreSQL via Prisma. There's no separate backend service yet - the admin
dashboard, the admin API, and the customer API are all routes in the same
app.

## Layers

```
app/admin/**            Server-rendered dashboard pages (auth-guarded in
                         app/admin/layout.tsx)
app/api/admin/**         Admin API - every route calls requireAdmin()
app/api/customer/**      Customer portal API - every route scopes to the
                         signed-in user's own Customer/Bot rows
app/status               Public, unauthenticated status page
auth.ts                  NextAuth v5 config (Discord OAuth + Prisma adapter)
lib/db.ts                Prisma client singleton (driver adapter: pg)
lib/crypto.ts             AES-256-GCM token vault
lib/plans.ts              Plan tier limits (free/starter/pro/enterprise)
lib/runner/*              RunnerAdapter interface + PM2/Docker stubs
lib/security-checks.ts    Real, dynamically computed security report
lib/alerts/discord-webhook.ts   Discord embed alerts (mass mentions disabled)
prisma/schema.prisma      The full data model
```

## Data model

- `User` / `Account` / `Session` / `VerificationToken` - the standard
  Auth.js Prisma adapter shape, extended with `discordUserId` and `role`
  (`owner` / `admin` / `member`).
- `Customer` - owned by a `User` (`ownerUserId`). Any signed-in user who
  owns a `Customer` row can access that customer's bots through
  `/api/customer/*`.
- `Bot` - belongs to a `Customer`, optionally assigned to a `Worker`. Holds
  `tokenEncrypted` (never returned by any API), plan, guild limit, shard
  count, and status.
- `BotHealth` - one-to-one with `Bot`: guild count, ping, memory, restart
  count, last safe error.
- `Worker` / `WorkerAssignment` - a worker can run multiple bots (default
  3-5, configurable via `maxBots`); `WorkerAssignment` is the join table.
- `Shard` - per-bot shard rows (only populated once a bot needs sharding).
- `AuditLog` - every admin/customer action that mutates state.
- `Alert` / `WebhookDestination` - alert records and where they're posted.
- `Deployment` - a record of what's deployed (not yet wired to an actual
  deploy pipeline).

## Why bot start/stop/restart don't control a real process yet

`lib/runner/types.ts` defines a `RunnerAdapter` interface with
`start`/`stop`/`restart`. `pm2-adapter.ts` and `docker-adapter.ts` both
implement it today by updating `Bot.status`/`BotHealth` directly - they
don't spawn or control anything. Every method has a `TODO(real-runner)`
comment describing exactly what a real implementation needs (a worker
process that decrypts the token in-memory and either runs it under PM2 or
inside a Docker container). The rest of the product - dashboard actions,
audit logging, alerts - is built against the interface, so wiring in a real
runner later doesn't require changing any caller.

## Auth model

- Admin/owner: promoted via `BOTFLEET_ADMIN_DISCORD_IDS` on first Discord
  sign-in (see `auth.ts`'s `session` callback). Can use `/admin` and every
  `/api/admin/*` route.
- Any other signed-in user: can create/own `Customer` rows and manage their
  own bots via `/api/customer/*`, but has no access to `/admin` or
  `/api/admin/*`.
