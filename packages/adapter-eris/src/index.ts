import * as Eris from "eris";
import type { BotFleetRuntime } from "@botfleet/runtime-sdk";

export interface AttachErisOptions {
  /** How often to send a heartbeat once ready. Default 30s. */
  heartbeatIntervalMs?: number;
}

function averageShardLatency(bot: Eris.Client): number | undefined {
  const latencies = [...bot.shards.values()]
    .map((shard) => shard.latency)
    .filter((latency) => Number.isFinite(latency) && latency >= 0);
  if (latencies.length === 0) return undefined;
  return Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length);
}

/**
 * Wires a real Eris `Client`'s lifecycle events into a `BotFleetRuntime` -
 * equivalent to `@botfleet/adapter-discordjs`'s `attachDiscordJs` for
 * Eris's event names/shapes. Returns a `detach()` function that removes
 * every listener and stops the heartbeat interval.
 */
export function attachEris(
  bot: Eris.Client,
  runtime: BotFleetRuntime,
  options: AttachErisOptions = {},
): () => void {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const onReady = () => {
    runtime.ready({
      guildCount: bot.guilds.size,
      shardCount: bot.shards.size,
      version: Eris.VERSION,
    });
    heartbeatTimer = setInterval(() => {
      runtime.heartbeat({
        shardCount: bot.shards.size,
        guildCount: bot.guilds.size,
        pingMs: averageShardLatency(bot),
      });
    }, heartbeatIntervalMs);
  };

  const onShardReady = (shardId: number) => {
    runtime.shardStatus({
      shardId,
      status: "connected",
      guildCount: [...bot.guilds.values()].filter((g) => g.shard.id === shardId).length,
      pingMs: bot.shards.get(shardId)?.latency,
    });
  };

  const onShardResume = (shardId: number) => {
    runtime.shardStatus({
      shardId,
      status: "connected",
      guildCount: [...bot.guilds.values()].filter((g) => g.shard.id === shardId).length,
      pingMs: bot.shards.get(shardId)?.latency,
    });
  };

  const onShardDisconnect = (err: Error | undefined, shardId: number) => {
    if (err) runtime.log("warn", `Shard ${shardId} disconnected: ${err.message}`);
    runtime.shardStatus({
      shardId,
      status: "disconnected",
      guildCount: [...bot.guilds.values()].filter((g) => g.shard.id === shardId).length,
    });
  };

  const onWarn = (message: string) => {
    runtime.log("warn", message);
  };

  const onError = (err: Error) => {
    runtime.log("error", `Eris client error: ${err.message}`);
  };

  bot.on("ready", onReady);
  bot.on("shardReady", onShardReady);
  bot.on("shardResume", onShardResume);
  bot.on("shardDisconnect", onShardDisconnect);
  bot.on("warn", onWarn);
  bot.on("error", onError);

  return function detach() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    bot.off("ready", onReady);
    bot.off("shardReady", onShardReady);
    bot.off("shardResume", onShardResume);
    bot.off("shardDisconnect", onShardDisconnect);
    bot.off("warn", onWarn);
    bot.off("error", onError);
  };
}
