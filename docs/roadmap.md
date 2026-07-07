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

## Next

- **Real process control**: replace the `RunnerAdapter` stubs
  (`lib/runner/*`) with an actual worker process that decrypts a token
  in-memory and runs it under PM2 or inside a Docker container, then
  reports heartbeats back into `bot_health`/`shards`.
- **Plugin system**: health checks, dashboard cards, alert rules, bot
  templates, deployment hooks as a real extension point.
- **AI worker queue**: log summarization, crash explanation, anomaly
  detection - queued, advisory-only, never given raw tokens.
- **Deployment manager**: actually trigger a deploy (drain workers,
  staggered restarts, safe maintenance mode) instead of only recording one.
- **Automatic** rebalancing (today's recommendations require a manual click
  to apply, by design - see docs/security.md on why nothing acts without
  an admin's confirmation).

## Explicitly out of scope for now

- Kubernetes support (PM2 and Docker Compose only, by design).
- Billing/payment processing - `plan` is a label BotFleet enforces limits
  against, not something it charges for.
