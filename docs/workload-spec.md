# Workload Specification

The versioned, validated description of how a bot should run - Phase 6
of `docs/distributed-audit.md`'s mission. Source of truth:
`packages/workload-spec/src/schema.ts`.

## Example

```json
{
  "apiVersion": "botfleet.io/v1",
  "kind": "DiscordBot",
  "metadata": { "name": "example-bot" },
  "spec": {
    "runtime": {
      "type": "node",
      "command": "node",
      "args": ["dist/index.js"],
      "workingDirectory": "/opt/bots/example"
    },
    "runner": { "type": "pm2" },
    "resources": { "memoryMb": 512, "cpuShares": 1 },
    "health": {
      "startupTimeoutSeconds": 60,
      "heartbeatTimeoutSeconds": 30,
      "gracefulShutdownTimeoutSeconds": 10,
      "restartPolicy": "on-failure",
      "maxRestartAttempts": 5
    },
    "placement": {
      "requiredLabels": { "region": "eu-central" },
      "preferredLabels": { "runner": "pm2" }
    }
  }
}
```

Every section except `runtime`/`runner` is optional and defaults exactly
as shown above if omitted.

## The one guarantee that matters most

**`runtime.command` + `runtime.args` is always an argv array, never a
shell string.** There is no field anywhere in this schema that accepts
"a command line" - `apps/agent/src/workload-runner.ts` calls
`child_process.spawn(command, args)` directly, with no `shell: true`
option, so there is no command-injection surface here by construction,
not by sanitization.

## Runtime types

- `type: "node"` - `command`, `args` (array), optional `workingDirectory`.
  This is the only type the agent's runner actually executes today (see
  "What's real" below).
- `type: "docker"` - `image`, `args`. Schema-validated; not yet executed
  by the agent (no Docker execution path on the agent side yet - see
  `docs/roadmap.md`).

## Environment variables

`spec.env` is an array of `{ name, value? }` or `{ name, secretRef? }`.
`secretRef` (resolving a real secret by reference rather than accepting
one inline) is schema-validated but not yet resolved by the agent - a
documented gap, not a silent one (see `docs/roadmap.md`).

## Placement

`requiredLabels`/`preferredLabels` are validated and stored today but not
yet consumed by anything - there is no scheduler yet (`docs/roadmap.md`).
A workload is assigned to an agent by an admin action
(`POST /api/admin/workloads/:id/assign`), not automatically.

## What's real vs. not yet

**Real, verified end-to-end** (live database + real running agent/gateway
processes, not mocked):

- `POST /api/admin/workloads` validates a spec through this schema before
  ever storing it (`lib/workloads.ts`'s `createWorkload`).
- `POST /api/admin/workloads/:id/assign` pushes the spec to an agent via a
  real `bot.update` command; the agent caches it by workload ID.
- `POST /api/admin/workloads/:id/command` (`start`/`stop`/`restart`)
  sends a real command through `lib/queue/agent-command-queue.ts` (a
  BullMQ queue - the transport between the Next.js API process and the
  separate agent-gateway process, which owns the live WebSocket
  connections) to the assigned agent, which **spawns/stops/restarts a
  real OS child process** via `child_process.spawn` - confirmed with a
  real PID, real stdout output, and clean `SIGTERM` (or forced `SIGKILL`
  after the spec's grace period, also verified) teardown.
- Command acknowledgement/result tracking: every command is a durable
  `AgentCommand` row, moved through `pending -> accepted ->
succeeded/failed` by the agent's own `agent.command_ack`/
  `agent.command_result` messages - never guessed at by the control
  plane.
- 7 schema contract tests (`packages/workload-spec`) + 6 real-child-process
  tests (`apps/agent/test/workload-runner.test.ts`, including a verified
  SIGKILL-after-grace-period force-kill).

**Not yet real:**

- Docker runtime execution (schema exists, agent doesn't act on it).
- `secretRef` resolution (schema exists, agent doesn't resolve one).
- Automatic restart-on-crash per `health.restartPolicy`/
  `maxRestartAttempts` - the agent faithfully reports a crash
  (`bot.crashed`/exit event) but doesn't yet re-apply the policy itself;
  that's reconciliation-loop territory (`docs/roadmap.md`).
- Scheduling by `placement` labels - assignment today is a manual admin
  action, not automatic.
