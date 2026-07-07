# BotFleet Protocol Reference

Source of truth: `packages/protocol/src/*.ts`. This file is hand-maintained
against that source, not auto-generated - if they ever disagree, the code
is correct and this file is stale; please fix this file, not the other way
around. (Introspecting Zod schemas into complete accurate docs
automatically is a real project, not a one-line script - hand-maintaining
against a small, stable-shaped source was the honest tradeoff for this
pass; see `docs/roadmap.md`.)

## Envelope

Every message, in both directions, is a JSON object matching:

| Field             | Type                     | Required | Notes                                                                                                                                                                                                                       |
| ----------------- | ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocolVersion` | positive integer         | yes      | Must be in `SUPPORTED_PROTOCOL_VERSIONS`. Unknown versions are rejected, not coerced.                                                                                                                                       |
| `messageId`       | UUID string              | yes      | Unique per message. Used for replay protection (`InMemoryReplayGuard`).                                                                                                                                                     |
| `timestamp`       | ISO 8601 datetime string | yes      | When the sender created the message.                                                                                                                                                                                        |
| `senderId`        | string, 1-256 chars      | yes      | Agent ID or a control-plane identifier.                                                                                                                                                                                     |
| `correlationId`   | UUID string              | no       | Links a response/result back to the request that caused it.                                                                                                                                                                 |
| `type`            | string                   | yes      | Discriminates which payload schema applies - see catalogs below.                                                                                                                                                            |
| `payload`         | object                   | yes      | Validated per `type`.                                                                                                                                                                                                       |
| `signature`       | string, up to 4096 chars | no       | Reserved for the authenticated-transport-context requirement (Phase 4: mTLS or an HMAC tied to the sender's enrolled credential). Not yet verified by this package - see `packages/protocol/src/envelope.ts`'s doc comment. |

Use `createAgentToControlPlaneMessage()` / `createControlPlaneToAgentMessage()`
to build one (fills in `protocolVersion`/`messageId`/`timestamp` correctly)
rather than constructing the envelope fields by hand.

## Parsing untrusted input

`parseAgentToControlPlaneMessage(raw)` and `parseControlPlaneToAgentMessage(raw)`
are the only supported entry points for turning `JSON.parse`d bytes from
the wire into a trusted, typed message. Neither throws; both return a
`ParseResult<T>`:

```ts
type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; reason: "malformed_envelope"; issues: string[] }
  | { ok: false; reason: "unsupported_protocol_version"; version: unknown }
  | { ok: false; reason: "unknown_message_type"; type: string }
  | { ok: false; reason: "malformed_payload"; type: string; issues: string[] };
```

Callers should log the `reason` and drop the message - never partially
apply a message whose payload didn't fully validate.

## AgentToControlPlane messages

| Type                   | Payload summary                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent.enroll`         | `enrollmentToken`, `agentName`, `hostname`, `architecture`, `operatingSystem`, `agentVersion`, `capabilities[]`, `labels`, optional `publicKey` |
| `agent.heartbeat`      | `agentId`, `status`, `resources` (CPU/memory/disk/load), `workloadCount`                                                                        |
| `agent.inventory`      | `agentId`, `workloads[]` (`workloadId`, `botId`, `runtimeStatus`)                                                                               |
| `agent.metrics`        | `agentId`, `samples[]` (`metric`, `value`, optional `unit`), capped at 500 samples/message                                                      |
| `agent.command_ack`    | `agentId`, `commandId`, `idempotencyKey`                                                                                                        |
| `agent.command_result` | `agentId`, `commandId`, `idempotencyKey`, `status` (`succeeded`\|`failed`), optional `safeError`                                                |
| `bot.status`           | `botId`, `status`                                                                                                                               |
| `bot.heartbeat`        | `botId`, `shardCount`, `guildCount`, optional `pingMs`                                                                                          |
| `bot.ready`            | `botId`, `guildCount`, `shardCount`, optional `version`                                                                                         |
| `bot.stopped`          | `botId`, optional `reason`                                                                                                                      |
| `bot.crashed`          | `botId`, `safeError` (must already be redacted - never a raw stack trace or token)                                                              |
| `bot.metrics`          | `botId`, `metric`, `value`, optional `unit`                                                                                                     |
| `bot.log`              | `botId`, `level`, `message` (max 2000 chars)                                                                                                    |
| `shard.status`         | `botId`, `shardId`, `status`, `guildCount`, optional `pingMs`                                                                                   |
| `deployment.progress`  | `deploymentId`, `workloadId`, `phase`, optional `message`                                                                                       |
| `deployment.result`    | `deploymentId`, `workloadId`, `status` (`succeeded`\|`failed`\|`rolled_back`), optional `safeError`                                             |

## ControlPlaneToAgent messages

Every command below (`bot.*`, `worker.drain`, `deployment.*`) requires an
`idempotencyKey` - re-delivering the same command (e.g. after a
reconnect) must be a no-op on the agent, not a duplicate action.

| Type                       | Payload summary                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent.accepted`           | `agentId`, `agentCredentialFingerprint`, `heartbeatIntervalMs`                                                                                                                 |
| `agent.rotate_certificate` | `agentId`, `newCertificateRef`                                                                                                                                                 |
| `bot.start`                | `workloadId`, `botId`, `idempotencyKey`                                                                                                                                        |
| `bot.stop`                 | `workloadId`, `botId`, `idempotencyKey`                                                                                                                                        |
| `bot.restart`              | `workloadId`, `botId`, `idempotencyKey`                                                                                                                                        |
| `bot.move`                 | `workloadId`, `botId`, `targetAgentId`, `idempotencyKey`                                                                                                                       |
| `bot.update`               | `workloadId`, `botId`, `specification` (loosely-typed JSON object today - Phase 6's workload spec package validates the real shape before this is ever sent), `idempotencyKey` |
| `worker.drain`             | `agentId`, `mode` (`graceful`\|`immediate`\|`maintenance-window`), `idempotencyKey`                                                                                            |
| `deployment.prepare`       | `deploymentId`, `workloadId`, `artifactRef`, `idempotencyKey`                                                                                                                  |
| `deployment.execute`       | `deploymentId`, `workloadId`, `idempotencyKey`                                                                                                                                 |
| `deployment.rollback`      | `deploymentId`, `workloadId`, `targetReleaseId`, `idempotencyKey`                                                                                                              |
| `configuration.refresh`    | `agentId`                                                                                                                                                                      |

## Replay protection

`InMemoryReplayGuard.checkAndRecord(messageId)` returns `true` if a
`messageId` has already been seen (reject as a replay) and `false` the
first time (record it and proceed). TTL-based eviction keeps memory
bounded. This is per-process; a multi-instance control plane needs a
shared (e.g. Redis-backed) implementation of the same `ReplayGuard`
interface - swap the implementation, not the call sites.

Note the distinction from **idempotency**: `messageId` replay protection
guards against the exact same bytes arriving twice (network retry,
duplicate delivery). `idempotencyKey` (on every command payload) guards
against the same _logical_ command being re-issued with a _new_
`messageId` (e.g. the control plane's reconciliation loop retrying a
timed-out `bot.restart`) - that's a domain-level dedupe the receiving
side's command handler is responsible for, not this package.

## Backward-compatibility rules

- **Additive is safe**: a new optional envelope field, a new message
  `type`, or a new optional payload field never requires a
  `PROTOCOL_VERSION` bump. Older peers ignore fields/types they don't
  recognize (an unknown `type` is rejected per-message, not fatal to the
  connection).
- **Removing or repurposing a field, or making an optional field
  required, is a breaking change** - bump `PROTOCOL_VERSION` and keep the
  previous version in `SUPPORTED_PROTOCOL_VERSIONS` until every deployed
  agent has upgraded (see `docs/agent-installation.md`, once it exists,
  for the deprecation window policy).
- A message with an unrecognized `protocolVersion` is rejected with
  `unsupported_protocol_version` before its payload is even inspected -
  never partially interpreted.
