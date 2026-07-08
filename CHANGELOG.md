# Changelog

All notable changes to BotFleet are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); this project
does not yet follow semantic version guarantees (pre-1.0).

Every entry below reflects code that was actually built and verified -
see `docs/roadmap.md` for full verification notes per feature and
`docs/distributed-audit.md` for the mission's own honesty conventions.

## [0.1.0] - Unreleased

Prepared, not published. See `docs/release-criteria.md` for exactly what
that means and what still requires explicit owner approval (publishing
images, creating a GitHub release, `npm publish`).

### Added - distributed control plane stabilization pass

- **Distributed locking**: `reconcileWorkloads()` now runs inside a real
  Postgres `pg_try_advisory_xact_lock` transaction, so a second
  control-plane instance's overlapping reconciliation tick does nothing
  instead of racing the first.
- **Ownership fencing**: `Workload.generation` is bumped on every
  (re)assignment and carried on every workload command; agents report
  what they're running and at what generation on every heartbeat
  (`agent.inventory`); the gateway fences (force-stops) any agent
  reporting a workload it no longer owns. This is the actual mechanism
  preventing two agents from running the same workload after a
  reconnect or network partition - verified live against a real
  simulated partition.
- **Safe agent draining**: `POST /api/admin/agents/:id/drain` relocates
  every workload off an agent using the real scheduler, stranding (not
  dropping) anything with no eligible target, and marks the agent
  disabled once empty.
- **Bounded retry/backoff/terminal failure**: repeated command failures
  back off exponentially and suspend reconciliation after 5 consecutive
  failures until an admin clears it (`POST
/api/admin/workloads/:id/clear-failure`).
- **`npm run demo:distributed`**: a real, scripted end-to-end acceptance
  walkthrough (two real agents, real scheduler placement, real
  reconciliation, real drain/relocation, real control-plane restart,
  real agent disconnect/reconnect, final `ps`-verified single-instance
  check) - not a fake success log; every checkmark is gated on an
  actual boolean condition.
- Full GitHub Actions CI pipeline (`.github/workflows/ci.yml`):
  format/lint, strict typecheck, unit tests, integration tests (real
  Postgres/Redis service containers), build, Prisma migration drift
  detection, container image builds (no push), a container smoke test,
  CodeQL, secret scanning (gitleaks), and SBOM generation.
- `apps/agent/Dockerfile` (this repo's first container image for the
  remote agent process).
- `docs/release-criteria.md` and this changelog.

### Fixed

- **CI failing on a genuinely fresh checkout**: `dist/` (every package's
  build output) and `apps/control-plane/app/generated/prisma` (the
  generated Prisma client) are correctly gitignored, but no CI job ever
  built or generated them before running `typecheck`/tests/`build` - the
  development sandbox never caught this because it already had those
  artifacts from earlier manual builds, so the gap only surfaced on this
  repo's actual first GitHub Actions run. Added a `build:packages` root
  script and `prisma generate` steps to every job (and both Dockerfiles,
  which had the identical bug) that needs them.
- **Stale command result corrupting current workload state**: when
  `drainAgent()` sends its explicit "stop the old copy" command to a
  just-relocated-away agent, that agent's legitimate success response
  was unconditionally overwriting `Workload.observedState` - even
  though a different, currently-assigned agent was already running the
  workload. `markCommandOutcome()` now only applies an observedState
  update when the result comes from the workload's _current_
  `assignedAgentId`.
- **Unschedulable `node`-runtime workloads**: `@botfleet/workload-spec`'s
  `runner.type` enum has always included `"node"`, but
  `@botfleet/protocol`'s agent capability enum never did - meaning no
  agent could ever be eligible for a `node`-runtime workload via the
  real scheduler (every manual verification before this pass bypassed
  the scheduler with direct assignment). Added `"node"` to the
  capability enum and made it part of `apps/agent`'s default capability
  set, since `node` is the only runtime its workload-runner actually
  executes today.
- Stale documentation/schema comments claiming "no scheduler yet" / "no
  reconciliation loop exists yet" after those features shipped in the
  previous phase.

### Changed

- Reformatted the files this pass touched with Prettier (`npm run
format`/`format:check` are new root scripts) - no prior commit had run
  Prettier over them.
- Extracted `markCommandOutcome`/`observedStateFor` out of
  `lib/agent-gateway/server.ts` (which starts a real HTTP/WS server at
  import time) into a new, side-effect-free
  `lib/agent-gateway/command-outcomes.ts`, specifically so this logic -
  the only place `Workload.observedState` is ever written - is
  unit-testable.

## [Unreleased before this pass] - distributed control plane, phases 0-9

- **Phase 0** - full repository audit (`docs/distributed-audit.md`):
  baseline install/lint/typecheck/build all green; confirmed no
  automated test suite existed anywhere before this mission.
- **Phase 1** - converted to an npm workspace (`apps/*`, `packages/*`,
  `examples/*`) with git history preserved.
- **Phase 2** - `@botfleet/protocol`: a versioned, Zod-validated message
  catalog for both directions, envelope validation, replay guard, and
  this repo's first real test suite.
- **Phase 3-4** - `apps/agent`: a real remote agent process connecting
  outbound over WebSocket, secure single-use-token enrollment, bearer
  credential reconnect (disclosed as not mTLS).
- **Phase 5** - `@botfleet/runtime-sdk` + discord.js/Eris adapters: bot
  processes only ever know a `botId` and a local Unix socket path, never
  a control-plane credential.
- **Phase 6-7** - `@botfleet/workload-spec`, `Workload`/`AgentCommand`
  Prisma models, real `child_process.spawn()` execution driven by
  commands crossing process boundaries via a BullMQ queue.
- **Phase 8** - `@botfleet/scheduler`: a pure, deterministic
  placement-scoring function; dry-run-only recommendations, applied
  only by an explicit admin action.
- **Phase 9** - `lib/reconciliation.ts`: compares desired vs. observed
  workload state every 30 seconds and self-heals; closed the gap where
  `Workload.observedState` was defined but never written to.

## [Unreleased before this pass] - single-node dashboard

The original BotFleet: data model, AES-256-GCM token vault, Discord OAuth
admin login, full admin + customer dashboard, plan/limit enforcement,
Docker Compose deployment, worker rebalancing recommendations, a plugin
system, an AI-assisted crash-explanation worker queue, scheduled alert
rule evaluation, real PM2/Docker process control, worker draining, safe
maintenance mode, and staggered restarts on deployment. See
`docs/roadmap.md`'s "Shipped (single-node dashboard, pre-distributed-
mission)" section for the full list with verification notes.
