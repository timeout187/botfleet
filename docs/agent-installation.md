# Agent Installation

`apps/agent` (`@botfleet/agent`) is a standalone Node process you run on
each server that will host bots. It connects **outbound** to the control
plane's agent gateway - no inbound port needs to be opened on the agent's
machine.

## Prerequisites

- The control plane running with its database migrated
  (`apps/control-plane`).
- The agent gateway running: `npm run agent-gateway` (a separate process
  from the Next.js web server - see `docs/architecture.md`). Defaults to
  port `4010`, configurable via `AGENT_GATEWAY_PORT`.
- An enrollment token, created by an admin at `/admin/agents` (or
  `POST /api/admin/agents/enrollment-tokens`) - see
  `docs/agent-enrollment.md`. It's single-use and short-lived (30 minutes
  by default), so generate it right before you start the agent.

## First run (enrollment)

```bash
BOTFLEET_CONTROL_PLANE_WS_URL=ws://your-control-plane-host:4010 \
BOTFLEET_AGENT_ENROLLMENT_TOKEN=<token from the admin UI> \
BOTFLEET_AGENT_NAME=eu-worker-1 \
BOTFLEET_AGENT_LABELS="region=eu-central,environment=production,runner=pm2" \
BOTFLEET_AGENT_CAPABILITIES="pm2" \
npm run agent:dev
```

On success, the agent logs `enrolled as agent <id>` and writes
`./botfleet-agent-state.json` (override with `BOTFLEET_AGENT_STATE_PATH`) -
this file holds the agent's own connection credential (not a bot token)
and is written with mode `0600`. **Back this file up or treat it as a
secret** - losing it means re-enrolling with a fresh token; leaking it
means revoking the credential (see `docs/security.md`).

## Every run after that (reconnect)

```bash
BOTFLEET_CONTROL_PLANE_WS_URL=ws://your-control-plane-host:4010 \
BOTFLEET_AGENT_STATE_PATH=./botfleet-agent-state.json \
npm run agent:dev
```

No enrollment token needed - the agent authenticates with its persisted
credential. This is what a process manager (systemd, PM2, a Docker
restart policy) should run.

## Environment variables

| Variable                          | Required       | Notes                                                                                                                                |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `BOTFLEET_CONTROL_PLANE_WS_URL`   | yes            | e.g. `ws://localhost:4010` (or `wss://...` behind a TLS-terminating proxy - the raw `ws` server here does not terminate TLS itself). |
| `BOTFLEET_AGENT_ENROLLMENT_TOKEN` | first run only | Single-use, from `/admin/agents`.                                                                                                    |
| `BOTFLEET_AGENT_STATE_PATH`       | no             | Default `./botfleet-agent-state.json`.                                                                                               |
| `BOTFLEET_AGENT_NAME`             | no             | Defaults to the machine's hostname.                                                                                                  |
| `BOTFLEET_AGENT_LABELS`           | no             | Comma-separated `key=value` pairs, e.g. `region=eu-central,tier=premium`.                                                            |
| `BOTFLEET_AGENT_CAPABILITIES`     | no             | Comma-separated, from `pm2`, `docker`, `discordjs`, `eris`, `ai-worker`, `custom-executable`. Defaults to `custom-executable`.       |

## Behavior

- **Reconnects forever** with exponential backoff + jitter (capped at
  30s) - it never gives up and never crash-loops on a transient network
  blip.
- **Real resource reporting**: CPU usage is sampled from actual
  idle-vs-total CPU tick deltas (`os.cpus()`, ~200ms sampling window per
  heartbeat), memory from `os.totalmem()`/`os.freemem()`, disk from
  `fs.promises.statfs("/")` where the platform supports it.
- **Graceful shutdown** on `SIGTERM`/`SIGINT`: closes its socket cleanly,
  which the gateway observes immediately (`Agent.status` flips to
  `disconnected` on socket close, not just on a missed-heartbeat timeout).
- Does **not** yet supervise real bot processes - see
  `docs/distributed-audit.md`/`docs/roadmap.md` for what's still ahead
  (workload scheduling, PM2/Docker command execution on the agent side).
