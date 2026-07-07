# Architecture

BotFleet is a single Next.js 16 (App Router) application backed by
PostgreSQL via Prisma, plus one standalone worker process for AI tasks.
There's no separate backend service for the dashboard/API - the admin
dashboard, the admin API, and the customer API are all routes in the same
Next.js app.

## Layers

```
app/admin/**             Server-rendered dashboard pages (auth-guarded in
                          app/admin/layout.tsx)
app/api/admin/**          Admin API - every route calls requireAdmin()
app/api/customer/**       Customer portal API - every route scopes to the
                          signed-in user's own Customer/Bot rows
app/status                Public, unauthenticated status page
app/setup                 First-run setup checklist (public until an owner exists)
auth.ts                   NextAuth v5 config (Discord OAuth + Prisma adapter)
lib/db.ts                 Prisma client singleton (driver adapter: pg)
lib/crypto.ts              AES-256-GCM token vault
lib/plans.ts               Plan tier limits (free/starter/pro/enterprise)
lib/runner/*               RunnerAdapter interface + PM2/Docker stubs
lib/rebalance.ts            Pure worker-rebalancing recommendation algorithm
lib/worker-assignment.ts    Keeps Bot.workerGroupId, Worker.currentBots, and
                          WorkerAssignment in sync in one transaction
lib/plugins/*               Plugin system: dashboard cards, health checks,
                          alert rules, bot templates, deployment hooks
lib/queue/*                 AI worker queue (BullMQ/Redis) - see below
lib/security-checks.ts      Real, dynamically computed security report
lib/alerts/discord-webhook.ts   Discord embed alerts (mass mentions disabled)
prisma/schema.prisma       The full data model
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
  3-5, configurable via `maxBots`); `WorkerAssignment` is the join table,
  kept in sync with `Bot.workerGroupId` by `lib/worker-assignment.ts`.
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
audit logging, alerts, rebalancing recommendations - is built against the
interface, so wiring in a real runner later doesn't require changing any
caller.

## Worker rebalancing

`lib/rebalance.ts` is a pure function: given the current workers and bots,
it recommends (a) assigning any unassigned bot to the least-loaded worker
with spare capacity, and (b) moving bots off any worker that's over its
`maxBots`. It never moves anything itself - an admin applies a
recommendation from the bot's detail page, which calls
`PATCH /api/admin/bots/:id` with a new `workerGroupId`.

## Plugin system

`lib/plugins/types.ts` defines `BotFleetPlugin`: an id/name/description
plus optional `dashboardCards`, `healthChecks`, `alertRules`,
`botTemplates`, and `deploymentHooks`. `lib/plugins/registry.ts` is an
in-process registry; `lib/plugins/index.ts` registers the six built-ins
(Redis connectivity card, PM2/Docker runner deployment hooks, two alert
rules, a Node.js version health check, discord.js/Eris bot templates).
Dashboard cards render on Fleet Overview; health checks merge into the
Security Center report; alert rules run on demand from `/admin/plugins`.

## AI worker queue

`lib/queue/*` is a real BullMQ queue backed by Redis
(`REDIS_URL`), consumed by a **separate Node process**
(`npm run worker:ai`, see `lib/queue/ai-worker.ts`) - not by the Next.js
web process, so a slow or stuck analysis job can never block a dashboard
request. Today it ships one job type, "explain this crash"
(`POST /api/admin/bots/:id/explain-crash`, polled via
`GET /api/admin/ai/jobs/:jobId`): the job payload is only ever a bot ID and
its already-redacted `BotHealth.lastErrorSafe` string - never a token.
`lib/queue/crash-analysis.ts` is a small, honest, deterministic rule set
over common Discord gateway/HTTP error signatures - **not** a call to an
LLM (there's no AI provider API key configured in this project). Caching:
identical `(botId, errorMessage)` pairs reuse the same BullMQ job ID for an
hour, so re-clicking the button on the same crash doesn't re-run analysis.

## Auth model

- Admin/owner: promoted via `BOTFLEET_ADMIN_DISCORD_IDS` on first Discord
  sign-in (see `auth.ts`'s `session` callback). Can use `/admin` and every
  `/api/admin/*` route. Owners can promote/demote other users' roles at
  `/admin/users` (the last remaining owner can never be demoted).
- Any other signed-in user: can create/own `Customer` rows and manage their
  own bots via `/api/customer/*`, but has no access to `/admin` or
  `/api/admin/*`.
