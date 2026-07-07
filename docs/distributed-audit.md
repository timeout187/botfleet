# Distributed Control Plane — Phase 0 Audit

Baseline audit performed before any code changes for the "BotFleet
Distributed Control Plane" mission. Everything below reflects the actual
state of the repository at commit `7b295e0`, verified by reading the
code and running the tooling - not by trusting README/docs claims.

## Baseline command results

Run against a live local Postgres 16 + Redis 7 (no mocks):

| Command | Result |
| --- | --- |
| `npm install` | Clean. `672 packages audited`, `6 moderate` advisories (2 root advisories, counted across more dependency paths than before - same two issues documented in `docs/security.md`: `@hono/node-server` via Prisma's unused `prisma dev` CLI, `postcss` via Next.js's bundled build pipeline. No new advisories.) |
| `npx tsc --noEmit` | Clean, 0 errors. |
| `npx eslint .` | Clean, 0 errors/warnings. |
| `npm run build` (`next build`) | Succeeds. 33 routes, all server-rendered on demand except `/_not-found`. |
| `npm run test` | **Script does not exist.** There is no automated test suite anywhere in this repository - no unit tests, no integration tests, no e2e tests, no test runner installed (no Vitest/Jest/etc in `package.json`). This is a real gap, not a docs inconsistency; Phase 19 of the distributed mission starts from zero. |

No `lint`/`typecheck`/`build` failures to fix. The codebase is in a clean,
shippable state as a **single-node** application.

## What is currently real

Verified end-to-end against live infrastructure in earlier sessions (see
`docs/roadmap.md` "Shipped" section for the full list with verification
notes):

- Full Prisma/Postgres data model, AES-256-GCM token vault, Discord OAuth
  admin auth, admin promotion, plan/limit enforcement.
- Worker rebalancing recommendations + real worker draining
  (`lib/rebalance.ts`, `lib/workers/drain.ts`) - a manual, single-process
  algorithm operating on `Worker`/`WorkerAssignment` rows.
- A real BullMQ/Redis queue (`lib/queue/*`) running in a **separate Node
  process** (`npm run worker:ai`), with three job types: crash
  explanation (rule-based, not an LLM), scheduled alert evaluation, and
  staggered post-deployment restarts.
- Real OS-level process control via PM2 (`lib/runner/pm2-adapter.ts`) -
  verified with an actual PID, heartbeat logs, clean teardown.
- A Docker runner (`lib/runner/docker-adapter.ts`) implemented identically
  via `dockerode`, but never verified end-to-end (sandbox network policy
  blocks Docker Hub pulls).
- Safe maintenance mode and deployment trigger + plugin hook execution.

## What is partially implemented

- **The plugin system** (`lib/plugins/*`) is a real in-process extension
  point (dashboard cards, health checks, alert rules, bot templates,
  deployment hooks), but it's a same-process registry, not a distributed
  capability negotiation mechanism. It has no concept of "this plugin
  requires an agent with Docker" - that mapping doesn't exist yet.
- **"Workers" today are a single flat concept** (`Worker` model: `mode`
  `pm2`|`docker`, `host` is a free-text string never actually connected
  to). There is no agent process, no outbound connection, no heartbeat
  protocol, no credential, no capability negotiation. A "worker" is a row
  the admin creates by hand describing a place bots conceptually run;
  **the actual PM2/Docker adapters always execute on the machine running
  the Next.js process itself**, regardless of which `Worker` row a bot is
  assigned to. This is the single most important finding: **BotFleet
  today has no distribution at all.** Every "worker" is local. This
  mission's entire premise (multi-server agents) requires building the
  thing that doesn't exist yet, not extending something partial.
- **Deployment "rollout"** is plugin hooks + a staggered restart queue -
  there is no artifact, no digest, no release history beyond one
  `Deployment` row per trigger, no rollback.

## What is stubbed / explicitly fake by design (disclosed in docs)

- `worker-runtime/bot-process.js` - not a real Discord client. Logs a
  heartbeat every 5s and exits cleanly on `SIGTERM`/`SIGINT`. This is
  intentionally honest scaffolding (there's no real bot token available
  in any sandbox this was built in), not a hidden gap.
- `lib/queue/crash-analysis.ts` - rule-based pattern matching over
  Discord gateway/HTTP error strings, not an LLM call (no AI provider key
  configured).
- Docker adapter - implemented, typechecked, never run to completion (see
  above).

## Current process lifecycle (single-node, today)

1. Admin creates a `Bot` row via `/admin/bots` (token encrypted at rest
   immediately, `lib/crypto.ts`).
2. Admin (or the customer portal) calls start/stop/restart.
3. `getRunnerAdapter(bot.workerGroup?.mode ?? "pm2")` picks the PM2 or
   Docker adapter **in the same process handling the HTTP request** (well,
   restart is now also reachable via the staggered-restart BullMQ job, but
   that job also runs the adapter code **on the same machine as the
   `worker:ai` process** - there's no RPC to a remote machine).
4. The adapter decrypts the token in memory, spawns
   `worker-runtime/bot-process.js` via PM2's programmatic API (or a Docker
   container), passing the token as an env var.
5. `Bot.status`/`BotHealth.status` transition `offline -> starting ->
   online` (or `-> stopping -> offline`), all written from the same
   process performing the spawn.
6. There is no live channel back from the spawned process into
   `BotHealth`/`Shard` beyond what the placeholder script logs to stdout
   (which PM2 captures, but BotFleet doesn't currently read PM2's log
   files back into the database - `BotHealth`/`Shard` are only updated by
   the API routes/adapters themselves, never by the bot process).

## Current token lifecycle

1. Stored encrypted (`Bot.tokenEncrypted`, AES-256-GCM,
   `BOTFLEET_ENCRYPTION_KEY`).
2. Decrypted only inside `lib/runner/pm2-adapter.ts` /
   `lib/runner/docker-adapter.ts`, in-memory, immediately before
   start/restart.
3. Passed as a plaintext env var (`BOTFLEET_BOT_TOKEN`) to the child
   process/container - standard practice for secrets delivered to a
   process, but notably: **env vars are visible to anything with access
   to `/proc/<pid>/environ`, `pm2 env <id>`, or `docker inspect`** on the
   host running the adapter. This is an accepted, disclosed risk at
   single-node scale; it becomes a much bigger one across trust
   boundaries (a remote agent, one day a third party's server) - see
   Phase 4/17 concerns below.
4. Never logged, never returned in any API response
   (`lib/serialize.ts` strips both `tokenEncrypted` and
   `webhookUrlEncrypted` from every response shape).
5. Rotation re-encrypts in place; audit log records that a rotation
   happened, never the value.

There is currently no concept of a *short-lived, scoped* credential - the
adapter always has the full decrypted token, for as long as the process
holding it stays up. A distributed agent needs a materially different
model (Phase 4's "no plaintext tokens in agent local state after launch"
requirement is not satisfiable by reusing this code unchanged - the token
still has to reach the agent process at least once to hand to the real
Discord client; the constraint is about *storage*, not about the token
never existing in the agent's memory).

## Current worker model

- `Worker` (Prisma): `id`, `name`, `mode` (`pm2`|`docker`), `status`
  (`online`|`offline`|`overloaded`|`failed`|`draining`), `host` (free
  text, unused for actual connectivity), `maxBots`, `currentBots`,
  `memoryMb`/`cpuPercent` (never populated by anything - no code writes
  to these columns today), `lastHeartbeatAt` (also never written to).
- `WorkerAssignment` links `Bot` <-> `Worker` with a status
  (`active`|`draining`|`removed`), kept in sync transactionally by
  `lib/worker-assignment.ts`'s `setBotWorker()`.
- `lib/rebalance.ts` computes recommendations treating a `draining`/
  `failed` worker's capacity as 0; `lib/workers/drain.ts` applies them
  for real (moves `WorkerAssignment` rows, flips `Bot.workerGroupId`).
- **None of this is enforced by anything actually running where the
  `Worker` row claims it does.** A `Worker` named "eu-03 Docker Host" with
  `host: "10.0.4.12"` is purely descriptive metadata today; every adapter
  call executes locally regardless.

This confirms the mission's framing is correct: BotFleet is a
single-node dashboard with excellent internal software engineering
(real queues, real process control, real transactional consistency) but
zero actual distribution. Phases 1-10 of the mission are not
"extending" existing distributed infrastructure - they're building the
first distributed primitive (an agent that's a separate deployable
process establishing an authenticated outbound connection) from scratch.

## Security risks identified (informing Phase 17)

1. **No isolation between "worker" metadata and execution reality** -
   today harmless (single trusted process), but the schema/UI already
   imply per-worker isolation that doesn't exist; anyone reading the
   `Worker` model without this audit could reasonably assume distribution
   already works.
2. **Env-var token delivery** is fine in a single trusted process; must
   not be the final design once a remote, less-trusted agent exists.
3. **No test suite** means every subsequent phase risks silent
   regressions in the existing (verified) single-node behavior unless
   Phase 19 (or at least contract tests for the protocol/scheduler) lands
   early, not last.
4. **`auth.ts`'s admin/owner promotion is Discord-ID-allowlist-based** -
   fine for today's two-role admin/customer split, but Phase 18's 9-role
   RBAC expansion needs a real permission-check layer; today
   `requireAdmin()` is a binary admin-or-not gate with no granular
   permissions at all.
5. **No CSRF token machinery beyond same-origin fetch conventions** - the
   admin UI relies on session cookies + same-origin `fetch` from
   server-rendered pages; this has been adequate because there are no
   cross-origin actors, but a CLI/agent/protocol surface introduces new
   authentication contexts that need their own explicit design (Phase
   2/4), not reuse of cookie-based session auth.

## Migration risks

1. **Workspace conversion (Phase 1) must not break `next build`/`next
   dev`** - the existing app has zero non-npm build tooling
   dependencies (Turbopack via Next.js's own CLI), so converting to npm
   workspaces mainly means: move `app/`, `components/`, `lib/`, `prisma/`,
   etc. into `apps/control-plane/`, add a root `package.json` with
   `"workspaces"`, and fix every `@/` path alias's `tsconfig.json`
   `baseUrl`/`paths` to resolve correctly relative to its new location.
   Prisma's generated client output path
   (`app/generated/prisma`, set in `prisma/schema.prisma`'s
   `generator client { output = ... }`) moves with the app; nothing else
   references it by absolute path.
2. **Git history preservation**: a plain `git mv` of the whole tree into
   `apps/control-plane/` preserves history per-file (Git tracks content,
   not paths, but `git log --follow` and blame both work fine across a
   directory move) - no special tooling needed, just correct
   sequencing (move first, verify build, commit as one atomic move
   before making other changes so the move commit is a pure rename Git
   can detect).
3. **`docker-compose.yml`, `Dockerfile`, CI (none exists yet - Phase 20 is
   still ahead), and any documented "clone and run" instructions** all
   hard-code paths relative to repo root today and must be updated in the
   same change that moves files, or `docker build .` and the setup
   instructions in `README.md` silently break.
4. **No CI currently exists at all** (`.github/workflows` is empty/absent
   - confirmed by listing the repo root: no `.github` directory). Every
   verification in this project so far has been manual, in this session.
   This is itself a risk the mission's Phase 20 addresses, but it means
   there's no safety net today catching a broken workspace conversion
   except the same manual `tsc`/`eslint`/`build` commands run here.

## Exact implementation sequence for this pass

Given the size of the full mission (22 phases, realistically many weeks
of work), this pass prioritizes real, working depth over breadth,
following the mission's own stated priority order:

1. ~~Phase 0 - this audit~~ (done)
2. Phase 1 - npm workspace conversion (`apps/control-plane`, `apps/agent`,
   `apps/simulator`, `packages/protocol`, `packages/shared`, ... created
   incrementally as each is needed, not all speculatively up front)
3. Phase 2 - `@botfleet/protocol`: versioned, Zod-validated message
   catalog + contract tests (this package has no dependency on anything
   that doesn't exist yet, so it's buildable and testable in complete
   isolation - the right place to also introduce the test runner this
   repo currently lacks)
4. Phase 7 (partial) - `Agent`/`EnrollmentToken`/`AgentCommand` Prisma
   models, additive migration
5. Phase 4 - enrollment token issuance + validation (server-side logic
   and API route, hashed storage, single-use, expiring)
6. Phase 3 - `apps/agent`: a real standalone Node process that opens an
   authenticated outbound WebSocket to the control plane, sends
   `agent.enroll`/`agent.heartbeat`, and is visible as a live `Agent` row
   with real `lastHeartbeatAt` updates
7. Continue into scheduler/reconciliation/simulator as budget allows,
   always preferring one real, verified vertical slice over multiple
   half-built ones.

Every subsequent phase's work is recorded in `docs/roadmap.md` and this
file is not updated further - it is a point-in-time Phase 0 snapshot, not
a living document.
