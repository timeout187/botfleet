# Roadmap

## Shipped

- Data model (Prisma + Postgres): users/accounts/sessions, customers, bots,
  bot health, workers, worker assignments, shards, audit logs, alerts,
  webhook destinations, deployments.
- AES-256-GCM token vault; tokens never leave the server.
- Discord OAuth admin login with allowlist-based first-run promotion.
- Full admin API + dashboard: Fleet Overview, Bots (list/detail/actions),
  Workers, Customers, Logs, Alerts (Discord webhooks + test), Security
  Center, Deployments (read view), Status (internal + public).
- Working customer portal API (any signed-in user who owns a `Customer` can
  manage their own bots - see docs/architecture.md).
- Plan/limit enforcement (free/starter/pro/enterprise).
- Docker Compose (app + Postgres + Redis) and a production Dockerfile.
- Mock-data seed script.
- Setup wizard (`/setup`): a real first-run checklist reflecting live env/DB
  state; `/` redirects here until an owner account exists.
- Admin promotion UI (`/admin/users`): owners can change any user's role,
  with a guard against demoting the last remaining owner.
- Worker rebalancing recommendations (`lib/rebalance.ts`): a real algorithm
  flags unassigned bots and over-capacity workers; applying a move is one
  click on the bot's detail page (nothing moves automatically).
- Plugin system (`lib/plugins/*`): a real extension point for dashboard
  cards, Security Center checks, alert rules, bot templates, and
  deployment hooks - 6 working built-in plugins ship today, browsable at
  `/admin/plugins`.
- AI worker queue (`lib/queue/*`): a real BullMQ/Redis queue with a
  separate worker process (`npm run worker:ai`), so analysis never blocks
  a request handler. One working task ships - "explain this crash" - using
  a rule-based analyzer (not an LLM call yet; see
  `lib/queue/crash-analysis.ts` for why and how to swap one in).
- Scheduled alert rule evaluation (`lib/queue/scheduler-queue.ts`): a real
  BullMQ repeatable job runs every alert rule every 5 minutes, sharing the
  exact same evaluation code (`lib/alerts/evaluate-rules.ts`) as the
  manual button at `/admin/plugins`.
- Deployment manager actually triggers something: "Trigger deployment" at
  `/admin/deployments` creates a real `Deployment` row and runs every
  registered plugin's `beforeDeploy()`/`afterDeploy()` hook, transitioning
  `pending -> in_progress -> success/failed` for real.
- Real process control, PM2 mode (`lib/runner/pm2-adapter.ts`): start/stop/
  restart spawns/stops/restarts an actual OS process per bot via the `pm2`
  package, with the token decrypted in-memory and passed as an env var.
  Verified end-to-end (real PID, real heartbeat logs, clean teardown).
  Docker mode (`lib/runner/docker-adapter.ts`) is implemented identically
  via `dockerode` but wasn't verified end-to-end in the sandbox this was
  built in (Docker Hub pulls are blocked there) - see docs/architecture.md.
- Worker draining (`lib/workers/drain.ts`): "Drain" on `/admin/workers`
  actually moves every bot off a worker onto other online workers with
  spare capacity (reusing `lib/rebalance.ts` - a draining worker's
  effective capacity is treated as 0), then marks it `offline` once empty.
  Bots that can't be moved (no capacity anywhere) are left in place and
  reported as "stranded" rather than silently failing. Verified end-to-end
  against the live database, including a case where global fleet demand
  (a separate unassigned bot) legitimately competed for the same target
  capacity - the algorithm's choice was correct, not a bug.
- Safe maintenance mode (`lib/system-state.ts`): a DB-backed `SystemState`
  singleton toggled from `/admin/settings`. While enabled, customer-triggered
  bot restarts (`POST /api/customer/bots/[id]/restart`) are blocked with a
  503, the public `/status` page shows "Scheduled maintenance" instead of
  its normal operational/degraded state, and every admin page shows a
  banner. Verified end-to-end against the live database: toggling the flag
  flips the status page badge in both directions.
- Staggered restarts on deployment (`lib/queue/restart-queue.ts`): once a
  triggered deployment's plugin hooks succeed, every currently-online bot
  gets a real BullMQ job that restarts it (via the same PM2/Docker runner
  used everywhere else), 15 seconds apart, in a separate worker process -
  never blocking the deployment request. Each job re-checks live state
  right before running: skipped if maintenance mode is on by then, or if
  the bot/its worker isn't online anymore. Verified end-to-end against the
  live database and a running `worker:ai` process: enqueued jobs actually
  restarted real PM2 processes, and re-enqueuing under maintenance mode
  produced the expected "skipped" result for every job instead.

## Next

- **A real Discord client behind the runner** - both runner adapters spawn
  `worker-runtime/bot-process.js`, a placeholder that doesn't actually
  connect to Discord (no real bot token available to build/test against).
  Swapping it for a real discord.js/Eris client (see
  `lib/plugins/builtin/bot-templates.ts`) and reporting readiness back into
  `bot_health`/`shards` is the natural next step.
- **Verify the Docker runner end-to-end** in an environment with normal
  Docker Hub access.
- **A real LLM behind the AI worker queue** - the queue/worker/caching
  plumbing is real today; `analyzeCrash()` is the one function that would
  change, and log summarization/anomaly detection would be new job types
  in the same queue.
- **Automatic** rebalancing (today's recommendations require a manual click
  to apply, by design - see docs/security.md on why nothing acts without
  an admin's confirmation).

## Explicitly out of scope for now

- Kubernetes support (PM2 and Docker Compose only, by design).
- Billing/payment processing - `plan` is a label BotFleet enforces limits
  against, not something it charges for.
