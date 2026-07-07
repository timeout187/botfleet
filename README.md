<div align="center">

# BotFleet

**Open-source control plane for Discord bot fleets.**

Manage white-label Discord bots, worker processes, shards, health checks,
logs, alerts, and customer limits from one dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

---

> **Status: early and under active development.** The data model, token
> vault, auth, and full admin + customer API layer are built and working
> against a real Postgres database. The dashboard UI, seed data, and Docker
> Compose setup are being built next - see the checklist below for exactly
> what's done vs. in progress. Nothing here fakes metrics, stars, or usage:
> if a feature isn't built yet, it's listed as not built yet.

## Why BotFleet

Most Discord bot developers start with one bot. Once you have 10, 20, or 100
- tokens, restarts, logs, customers, guild limits, shards, health checks,
crashes, billing plans, and deployments all become chaos. BotFleet is meant
to become the open-source control plane for that: a bot registry, an
encrypted token vault, a fleet dashboard, worker/shard management, a
white-label customer portal, plan enforcement, alerts, and a security
center - all self-hostable.

## Features

**Built and working today:**

- 🔐 **Encrypted token vault** - bot tokens are encrypted at rest with
  AES-256-GCM, decrypted only inside the trusted server runtime, and never
  returned by any API response (not even redacted).
- 🗄️ **Full fleet data model** - customers, bots, bot health, workers,
  worker assignments, shards, audit logs, alerts, webhook destinations, and
  deployments, via Prisma migrations against PostgreSQL.
- 🔑 **Discord OAuth admin login** - sign in with Discord; the first
  allowlisted Discord user ID is promoted to owner automatically.
- 🧑‍💼 **Full admin API** - fleet overview metrics, bot CRUD, start/stop/
  restart/rotate-token, worker management, logs, alerts + Discord webhook
  test, and a real security score endpoint.
- 👤 **Working customer portal API** - any signed-in user who owns a
  customer record can list/view their own bots, see plan limits, and
  restart their bot if their plan allows it - fully isolated from other
  customers' data and from admin tooling.
- 📋 **Plan/limit enforcement** - free/starter/pro/enterprise tiers cap bot
  count, guild count, and shard count; enforced server-side on create/update.
- 🚨 **Discord alert webhooks** - alerts post as embeds with mass mentions
  always disabled (`allowed_mentions.parse = []`).
- 🛡️ **Security center checks** - a real, dynamically computed report (key
  configured, admin configured, OAuth configured, CSP enabled, etc.) - not a
  hardcoded score.

**Explicitly stubbed, with clear `TODO(real-runner)` markers in the code:**

- Bot start/stop/restart today update status in the database through a
  `RunnerAdapter` interface (PM2 and Docker adapters both exist) but don't
  yet spawn or control a real process. See
  [`lib/runner/pm2-adapter.ts`](./lib/runner/pm2-adapter.ts).

**Not built yet** (tracked in [issues](https://github.com/timeout187/botfleet/issues)):

- Dashboard UI, seed/mock data, Docker Compose, shard-level UI, deployment
  manager UI, AI worker queue, plugin system, status page, setup wizard.

## Architecture

```mermaid
flowchart TD
    subgraph Browser
        ADMIN[/admin dashboard/]
        LOGIN[/login - Discord OAuth/]
    end

    subgraph "Next.js app (App Router)"
        API_ADMIN["/api/admin/* route handlers"]
        API_CUSTOMER["/api/customer/* route handlers"]
        AUTH[auth.ts - NextAuth + Prisma adapter]
    end

    subgraph lib
        CRYPTO[crypto.ts - AES-256-GCM vault]
        RUNNER[runner/* - PM2 / Docker adapters]
        PLANS[plans.ts - limit enforcement]
        SECURITY[security-checks.ts]
        ALERTS[alerts/discord-webhook.ts]
    end

    ADMIN --> API_ADMIN
    LOGIN --> AUTH
    API_ADMIN --> CRYPTO
    API_ADMIN --> RUNNER
    API_ADMIN --> PLANS
    API_ADMIN --> SECURITY
    API_ADMIN --> ALERTS
    API_CUSTOMER --> PLANS

    API_ADMIN --> DB[(PostgreSQL via Prisma)]
    API_CUSTOMER --> DB
    AUTH --> DB
```

## Quickstart

```bash
git clone https://github.com/timeout187/botfleet.git
cd botfleet
npm install

cp .env.example .env
# edit .env: DATABASE_URL, BOTFLEET_ENCRYPTION_KEY, AUTH_DISCORD_ID/SECRET,
# AUTH_SECRET, BOTFLEET_ADMIN_DISCORD_IDS

npx prisma migrate deploy
npm run dev
```

Generate the two required secrets:

```bash
openssl rand -base64 32   # BOTFLEET_ENCRYPTION_KEY
openssl rand -base64 32   # AUTH_SECRET
```

Create a Discord OAuth app at the
[Discord Developer Portal](https://discord.com/developers/applications),
add `http://localhost:3000/api/auth/callback/discord` as a redirect, and put
its client ID/secret in `.env`. Put your own Discord user ID in
`BOTFLEET_ADMIN_DISCORD_IDS` to be promoted to owner on first sign-in.

## Security model

- **Token vault**: AES-256-GCM, 32-byte key from `BOTFLEET_ENCRYPTION_KEY`.
  See [`lib/crypto.ts`](./lib/crypto.ts). Encrypted tokens never leave the
  server - no API route returns `tokenEncrypted`, not even masked.
- **Admin API**: every `/api/admin/*` route calls `requireAdmin()`, which
  returns a JSON 401/403 - it never redirects a fetch request to a login
  page. See [`lib/require-admin.ts`](./lib/require-admin.ts).
- **Customer isolation**: `loadOwnedBot()` only returns a bot if it belongs
  to a customer owned by the requesting user, and returns "not found" (not
  "forbidden") for both nonexistent and not-yours bots, so IDs can't be
  probed. See [`lib/require-customer.ts`](./lib/require-customer.ts).
- **CSP**: a restrictive Content-Security-Policy (no `unsafe-eval` in
  production) is set for every response in [`next.config.ts`](./next.config.ts).
- **Security Center**: `GET /api/admin/security` computes a real report from
  actual environment/DB state - see [`lib/security-checks.ts`](./lib/security-checks.ts).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). This project is early-stage and
the shape of things is still settling - open an issue before a large PR.

## License

[MIT](./LICENSE).
