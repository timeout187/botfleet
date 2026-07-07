# Roadmap

> Source paths below (`lib/`, `app/`, ...) are relative to
> `apps/control-plane/` - see `docs/distributed-audit.md` for the
> workspace conversion.

## Distributed control plane mission

BotFleet is being extended from the single-node dashboard described below
into a real distributed control plane (agents on remote servers, a
versioned protocol, scheduling, reconciliation, secure enrollment - see
`docs/distributed-audit.md` for the full mission and honest baseline).
This is a large, multi-phase effort; status:

**Shipped:**

- **Phase 0 - audit** (`docs/distributed-audit.md`): baseline
  install/lint/typecheck/build all green, confirmed **no automated test
  suite existed anywhere in the repo before this mission**, and documented
  that "workers" today are purely descriptive DB rows - every runner
  adapter always executes locally, there is no actual distribution yet.
- **Phase 1 - npm workspace** (`apps/*`, `packages/*`): the existing app
  moved to `apps/control-plane` with git history preserved; root scripts
  (`dev`/`build`/`lint`/`typecheck`/`test`/`verify`) delegate to each
  workspace. Verified: fresh install, full `npm run verify`, migrations,
  `worker:ai`, and `npm run dev` all work from the new layout.
- **Phase 2 - protocol package** (`packages/protocol`, `@botfleet/protocol`):
  a versioned, Zod-validated message catalog for both directions
  (`AgentToControlPlane`/`ControlPlaneToAgent` - see
  `docs/protocol-reference.md` for the full catalog), envelope validation
  that never throws on malformed/unversioned/unknown input, a replay
  guard, and this repo's first real test suite (Vitest, 18 contract tests:
  valid parses, every malformed-input rejection path, payload size caps,
  full catalog completeness against the mission's specified message list).
  This package is also where `npm run test`/`test:integration`/`test:e2e`
  and `npm run verify` first became real commands rather than no-ops.
- **Phase 3-4 - remote agent + secure enrollment** (`apps/agent`,
  `lib/agent-gateway/*`, `lib/agents/*`): a real standalone agent process
  that connects outbound over WebSocket, enrolls with a single-use
  admin-issued token (`/admin/agents`, `POST
/api/admin/agents/enrollment-tokens`), and reconnects on every
  subsequent run using a persisted bearer credential - no token needed
  after the first enrollment. See `docs/agent-enrollment.md` and
  `docs/agent-installation.md` for the full flow and the disclosed
  non-mTLS credential model. Verified end-to-end against a live database
  and real running processes (not mocked): fresh enrollment creates a real
  `Agent` row with real host metrics (actual CPU/memory/disk sampling);
  heartbeats advance `lastHeartbeatAt` every ~15s; a clean `SIGTERM`
  flips status to `disconnected` immediately; a reconnect using only the
  persisted credential reuses the same `agentId` (confirmed exactly one
  `Agent` row, not a duplicate); replaying an already-consumed enrollment
  token is rejected on every retry with no orphaned `Agent` row left
  behind; and a token restricted to `environment: "production"` correctly
  rejects an agent declaring a different environment (and is still burned,
  so it can't be retried).
- **Phase 5 - runtime SDK + discord.js/Eris adapters** (`packages/runtime-sdk`,
  `packages/adapter-discordjs`, `packages/adapter-eris`,
  `examples/discordjs-basic`, `examples/eris-basic`): the SDK a bot process
  links against only ever knows a `botId` and a local Unix socket path -
  no control-plane URL, credential, or database access, by construction.
  `apps/agent/src/local-ipc.ts` is the server on the other end: an
  allowlist of message types plus full `@botfleet/protocol` payload
  validation before forwarding anything up the agent's own authenticated
  connection. `attachDiscordJs()`/`attachEris()` wire a real client's
  events into the runtime automatically. See `docs/runtime-sdk.md` for
  the full security model (size limits, rate limits, reconnect-with-
  bounded-queue resilience). Verified end-to-end with real running
  processes (not mocked): the `discordjs-basic` example's `log()`/
  `gracefulShutdown()` calls traveled over a real Unix socket to a real
  agent, were forwarded over that agent's real authenticated WebSocket
  connection, and arrived at the control plane's gateway correctly typed
  and attributed to the right `agentId`. The adapters are each tested
  against a real `discord.js`/`Eris` client instance with events emitted
  directly (no token available in this sandbox to reach a live gateway).
- **Phase 6-7 - workload spec + real execution + data model**
  (`packages/workload-spec`, `Workload`/`AgentCommand` Prisma models,
  `apps/agent/src/workload-runner.ts`, `lib/workloads.ts`,
  `/admin/workloads`): a versioned, Zod-validated spec (command+args as
  an argv array, never a shell string - see `docs/workload-spec.md`) an
  admin creates and assigns to an agent, which actually executes it as a
  real `child_process.spawn()` OS process. Commands cross from the
  Next.js API process to the separate agent-gateway process (which owns
  live WebSocket connections) via a new BullMQ queue
  (`lib/queue/agent-command-queue.ts`), the same pattern `worker:ai`
  already uses for a different cross-process problem. Every command is a
  durable `AgentCommand` row moved through
  `pending -> accepted -> succeeded/failed` by the agent's own ack/result
  messages. Verified end-to-end against a live database and real running
  processes: creating a workload, assigning it to a real enrolled agent,
  and issuing start produced a real child process (real PID, real stdout
  output); stop sent a real `SIGTERM` and the process actually exited;
  a separate test confirmed an unresponsive process gets force-killed
  with `SIGKILL` after its spec's grace period. 13 new tests (7 schema
  contract tests, 6 real-child-process tests including the SIGKILL path).

- **Phase 8 - scheduler** (`packages/scheduler`, `@botfleet/scheduler`):
  a pure, side-effect-free placement-scoring function (hard eligibility
  filters - online status, capabilities, labels, memory, capacity,
  environment - then weighted soft scoring - region, memory headroom,
  load spread, customer anti-affinity, stability, recent-failure
  penalty). Dry-run only by design: `lib/scheduling.ts`'s
  `computeSchedulingRecommendation()` records a `PlacementDecision` row
  but never assigns anything; an admin still applies a placement
  explicitly via the existing `POST /api/admin/workloads/:id/assign`.
  `WorkloadActions.tsx` gained a "Get recommendation" button showing the
  full candidate score breakdown. See `docs/scheduler.md`. 16 unit tests
  (`packages/scheduler/test/schedule.test.ts`), all passing - deterministic
  and infra-free by construction, so every hard filter and soft
  preference is tested in isolation.
- **Phase 9 - reconciliation loop** (`lib/reconciliation.ts`): compares
  each assigned workload's `desiredState` against its `observedState`
  every 30 seconds (`lib/queue/scheduler-queue.ts`'s
  `ensureReconciliationScheduled()`, run by the existing `worker:ai`
  process) and re-issues a `start`/`stop` command when they disagree,
  skipping any workload with a command already in flight. This also
  closed a real gap from Phase 6-7: `Workload.observedState` was defined
  in the schema but nothing ever wrote to it - `handleCommandResult()` in
  `lib/agent-gateway/server.ts` now maps each `agent.command_result` to
  the right observed state. See `docs/reconciliation.md` for the full
  verification: a live agent actually spawning and killing a real child
  process in response to a desynced state the loop detected and
  corrected on its own schedule (not manually triggered), plus 4 real-DB
  integration tests covering all four branches.

**Not started yet** (remaining distributed-mission phases, roughly in the
mission's own priority order): Docker runtime execution and `secretRef`
resolution (both schema-validated, neither executed yet),
distributed drain/evacuation with fencing (Phase 10), deployment artifacts + rollout
strategies, the fleet simulator, further dashboard UI (a Scheduler page,
real-time updates), the CLI, observability
(OpenTelemetry/Prometheus), expanded RBAC/approvals, the broader security
test suite, and the acceptance-test demo script. Each will be added to
"Shipped" above with its own verification notes as it actually lands -
none of it is claimed done until it's real and tested, per this project's
own conventions (see CONTRIBUTING.md).

## Shipped (single-node dashboard, pre-distributed-mission)

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

## Next (single-node dashboard gaps, distinct from the distributed-mission phases above)

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
