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

## Real process control

`lib/runner/types.ts` defines a `RunnerAdapter` interface with
`start`/`stop`/`restart`. Both implementations decrypt the bot's token
in-memory (never logged, never written to disk) and pass it as an env var
to a spawned `worker-runtime/bot-process.js` process - a placeholder
client (see that file's header comment for why: it's not a real
discord.js/Eris client, since building/testing against a live Discord
gateway needs a real bot token this project doesn't have and shouldn't
fabricate).

- **PM2 adapter** (`lib/runner/pm2-adapter.ts` + `pm2-client.ts`): uses the
  `pm2` npm package's programmatic API to actually spawn/stop/restart an OS
  process per bot, named `botfleet-bot-<id>`. **Verified end-to-end**: a
  real process was started (confirmed via `pm2 list` showing an `online`
  status and a real PID), its heartbeat log lines were observed via
  `pm2 logs`, and it was cleanly stopped and removed.
- **Docker adapter** (`lib/runner/docker-adapter.ts` + `docker-client.ts`):
  uses `dockerode` to create/start/stop/restart a container per bot from
  the `botfleet-worker-runtime` image (`npm run worker:build-image`
  builds it from `worker-runtime/Dockerfile`). The `dockerode` client's
  connection to the Docker daemon was verified directly (`docker.info()`
  and `listContainers()` both succeeded against a live daemon), but the
  full create-container flow could **not** be run end-to-end in the
  sandbox this was built in - that environment's network policy blocks
  pulling `node:20-slim` from Docker Hub. Verify this adapter with a real
  `docker build` + start/stop cycle before relying on it in production.
- Both `pm2` and `dockerode` are marked `serverExternalPackages` in
  `next.config.ts` - both packages do dynamic `require()`s (native
  bindings, a bundled terminal UI) that break webpack/turbopack's static
  bundling otherwise.

Note that running either adapter for real requires the app process to
have the corresponding runtime available: a PM2 daemon it can spawn/talk
to, or access to a Docker socket (mount `/var/run/docker.sock` into the
`app` container if you want the Docker adapter to work from inside
Compose).

## Worker rebalancing

`lib/rebalance.ts` is a pure function: given the current workers and bots,
it recommends (a) assigning any unassigned bot to the least-loaded
_online_ worker with spare capacity, and (b) moving bots off any worker
that's over its effective capacity. A worker's effective capacity is its
`maxBots` normally, but 0 if it's `draining` or `failed` - so every one of
a draining worker's bots gets a move recommendation for free. The
recommendations panel on `/admin/workers` never moves anything itself -
an admin applies one from the bot's detail page, which calls
`PATCH /api/admin/bots/:id` with a new `workerGroupId`.

`lib/workers/drain.ts` builds on the same function to make "Drain" on
`/admin/workers` a real action: it sets the worker's status to `draining`,
computes recommendations, and actually applies every move via
`setBotWorker()` (not just reporting them). Bots that have nowhere to go
are left in place and returned as "stranded" rather than silently dropped
or erroring out - draining a worker never loses track of a bot.

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

The same process also runs a second BullMQ `Worker`, on a separate
`botfleet-scheduled-tasks` queue (`lib/queue/scheduler-queue.ts`), for a
real repeatable job that evaluates every alert rule every 5 minutes.
`ensureAlertEvaluationScheduled()` registers this job on worker startup;
BullMQ dedupes repeatable jobs by their repeat key, so this is safe to
call every time the worker restarts - it never creates a second schedule.
This job and the manual "Evaluate alert rules now" button on
`/admin/plugins` both call the same `lib/alerts/evaluate-rules.ts`
function, so there's one evaluation code path, not two that could drift.

## Auth model

- Admin/owner: promoted via `BOTFLEET_ADMIN_DISCORD_IDS` on first Discord
  sign-in (see `auth.ts`'s `session` callback). Can use `/admin` and every
  `/api/admin/*` route. Owners can promote/demote other users' roles at
  `/admin/users` (the last remaining owner can never be demoted).
- Any other signed-in user: can create/own `Customer` rows and manage their
  own bots via `/api/customer/*`, but has no access to `/admin` or
  `/api/admin/*`.
