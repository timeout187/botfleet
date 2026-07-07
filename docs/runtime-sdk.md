# Runtime SDK

How an independently developed Discord bot reports its own status into
BotFleet without ever touching the control plane directly - Phase 5 of
`docs/distributed-audit.md`'s mission.

## Packages

- `@botfleet/runtime-sdk` - transport-agnostic client: connects to the
  agent's local Unix socket, exposes `ready()`/`heartbeat()`/`metric()`/
  `log()`/`shardStatus()`/`crashed()`/`gracefulShutdown()`.
- `@botfleet/adapter-discordjs` - `attachDiscordJs(client, runtime)` wires
  a real discord.js `Client`'s events into the runtime automatically.
- `@botfleet/adapter-eris` - `attachEris(bot, runtime)`, the Eris
  equivalent.
- `examples/discordjs-basic`, `examples/eris-basic` - complete, runnable
  reference bots. Never commit a real token - both read
  `DISCORD_BOT_TOKEN` from `.env` (see each example's `.env.example`) and
  work with it unset (skipping the actual gateway login) so the
  SDK/adapter/local-IPC path can be exercised without one.

## Developer experience

```ts
import { createBotFleetRuntime } from "@botfleet/runtime-sdk";

const runtime = createBotFleetRuntime({
  botId: process.env.BOTFLEET_BOT_ID!,
  socketPath: process.env.BOTFLEET_AGENT_SOCKET!,
});

await runtime.start();
runtime.ready({ guildCount, shardCount, version });
runtime.metric("discord.gateway.ping", pingMs);
runtime.log("info", "Bot ready");
await runtime.gracefulShutdown();
```

```ts
import { attachDiscordJs } from "@botfleet/adapter-discordjs";
attachDiscordJs(client, runtime); // reports ready/heartbeat/shard events automatically
```

## Security model

- **The only thing this SDK ever knows is a botId and a local socket
  path.** No control-plane URL, no credential, no database connection -
  bot code has no way to reach anything beyond "report my own status to
  my own agent," by construction (see `apps/agent/src/local-ipc.ts`,
  which is the only thing on the other end of that socket).
- **Local IPC only**: the transport is a Unix domain socket
  (`apps/agent/src/local-ipc.ts`), not a network port - nothing off-box
  can reach it.
- **Message size limits**: `log()` truncates to 2000 characters
  client-side (mirroring `@botfleet/protocol`'s `bot.log` payload cap) -
  even before the agent's own validation would reject an oversized one.
- **Rate limits**: `log()` and `metric()` are each capped (20/s and 50/s
  respectively, `FixedWindowRateLimiter`) - a crash-looping bot can't
  flood its agent or the control plane's database.
- **Survives the agent being temporarily unavailable**: `AgentSocketClient`
  reconnects with exponential backoff (capped at 10s) and queues messages
  in a small bounded buffer (oldest dropped first) while disconnected -
  `runtime.start()` never throws just because the agent isn't up yet.
- **Defense in depth on the agent side**: `local-ipc.ts` allowlists which
  message types a local bot process may send (only `bot.*`/`shard.status`
  - never `agent.enroll` or a forged command result) and re-validates the
    full payload shape through `@botfleet/protocol` before forwarding
    anything upstream.

## Verified end-to-end

Against a live database and real running processes (agent gateway +
agent + the `examples/discordjs-basic` example, no mocks): the example's
`runtime.log()`/`runtime.gracefulShutdown()` calls traveled over a real
Unix socket to a real agent process, were validated and forwarded over
that agent's real authenticated WebSocket connection, and arrived at the
control plane's agent gateway correctly typed (`bot.log`, `bot.stopped`)
and attributed to the right `agentId` - confirmed in the gateway's own
log output. `attachDiscordJs`/`attachEris` are each tested against a real
`discord.js`/`Eris` client instance (constructed for real, never
connected to Discord's actual gateway - no token available in this
sandbox) with events emitted directly, verifying the adapter's handlers
fire correctly and call through to the runtime with the right data (15
tests total: 6 in `@botfleet/runtime-sdk`, 5 in
`@botfleet/adapter-discordjs`, 4 in `@botfleet/adapter-eris`).
