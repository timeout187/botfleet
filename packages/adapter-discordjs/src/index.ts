import { version as discordJsVersion } from "discord.js";
import type { Client } from "discord.js";
import type { BotFleetRuntime } from "@botfleet/runtime-sdk";

export interface AttachDiscordJsOptions {
  /** How often to send a heartbeat once ready. Default 30s. */
  heartbeatIntervalMs?: number;
}

/**
 * Wires a real discord.js `Client`'s lifecycle events into a
 * `BotFleetRuntime` - the bot's own code never needs to call
 * `runtime.ready()`/`runtime.heartbeat()` by hand for the common cases.
 * Returns a `detach()` function that removes every listener and stops the
 * heartbeat interval (call it on your own graceful shutdown, before
 * `runtime.gracefulShutdown()`).
 */
export function attachDiscordJs(
  client: Client,
  runtime: BotFleetRuntime,
  options: AttachDiscordJsOptions = {},
): () => void {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const onReady = () => {
    runtime.ready({
      guildCount: client.guilds.cache.size,
      shardCount: client.ws.shards.size,
      version: discordJsVersion,
    });
    heartbeatTimer = setInterval(() => {
      runtime.heartbeat({
        shardCount: client.ws.shards.size,
        guildCount: client.guilds.cache.size,
        pingMs: client.ws.ping >= 0 ? client.ws.ping : undefined,
      });
    }, heartbeatIntervalMs);
  };

  const onShardReconnecting = (shardId: number) => {
    runtime.log("warn", `Shard ${shardId} reconnecting`);
  };

  const onShardResume = (shardId: number) => {
    const shard = client.ws.shards.get(shardId);
    runtime.shardStatus({
      shardId,
      status: "connected",
      guildCount: client.guilds.cache.filter((g) => g.shardId === shardId).size,
      pingMs: shard && shard.ping >= 0 ? shard.ping : undefined,
    });
  };

  const onShardDisconnect = (_event: unknown, shardId: number) => {
    runtime.shardStatus({
      shardId,
      status: "disconnected",
      guildCount: client.guilds.cache.filter((g) => g.shardId === shardId).size,
    });
  };

  const onInvalidated = () => {
    runtime.log("error", "Discord session invalidated");
  };

  const onClientError = (error: Error) => {
    runtime.log("error", `discord.js client error: ${error.message}`);
  };

  client.once("ready", onReady);
  client.on("shardReconnecting", onShardReconnecting);
  client.on("shardResume", onShardResume);
  client.on("shardDisconnect", onShardDisconnect);
  client.on("invalidated", onInvalidated);
  client.on("error", onClientError);

  return function detach() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    client.off("ready", onReady);
    client.off("shardReconnecting", onShardReconnecting);
    client.off("shardResume", onShardResume);
    client.off("shardDisconnect", onShardDisconnect);
    client.off("invalidated", onInvalidated);
    client.off("error", onClientError);
  };
}
