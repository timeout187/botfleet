import type { LogLevel, ShardRuntimeStatus } from "@botfleet/protocol";
import { AgentSocketClient, type LocalMessage } from "./socket-client";
import { FixedWindowRateLimiter } from "./rate-limiter";

export interface BotFleetRuntimeOptions {
  botId: string;
  /** Path to the agent's local Unix socket (see
   * apps/agent/src/local-ipc.ts) - the only thing this SDK ever talks to.
   * There is no control-plane URL, credential, or database access
   * anywhere in this package by design: bot code should never be able to
   * reach anything beyond "report my own status to my own agent." */
  socketPath: string;
}

export interface ReadyInfo {
  guildCount: number;
  shardCount: number;
  version?: string;
}

export interface HeartbeatInfo {
  shardCount: number;
  guildCount: number;
  pingMs?: number;
}

export interface ShardStatusInfo {
  shardId: number;
  status: ShardRuntimeStatus;
  guildCount: number;
  pingMs?: number;
}

export interface BotFleetRuntime {
  start(): Promise<void>;
  ready(info: ReadyInfo): void;
  heartbeat(info: HeartbeatInfo): void;
  metric(metric: string, value: number, unit?: string): void;
  log(level: LogLevel, message: string): void;
  shardStatus(info: ShardStatusInfo): void;
  /** `safeError` must already be redacted by the caller - never a raw
   * stack trace or a value that could contain a token. This SDK has no
   * way to tell the difference, so it can't enforce that; it's on the
   * adapter/bot code calling it. */
  crashed(safeError: string): void;
  gracefulShutdown(): Promise<void>;
}

/** Mirrors @botfleet/protocol's bot.log payload cap - truncated
 * client-side too, so an oversized message is shortened here rather than
 * rejected later by the agent/control plane. */
const MAX_LOG_MESSAGE_LENGTH = 2000;
const LOG_RATE_LIMIT_PER_WINDOW = 20;
const LOG_RATE_LIMIT_WINDOW_MS = 1000;
const METRIC_RATE_LIMIT_PER_WINDOW = 50;
const METRIC_RATE_LIMIT_WINDOW_MS = 1000;

export function createBotFleetRuntime(options: BotFleetRuntimeOptions): BotFleetRuntime {
  const { botId, socketPath } = options;
  const client = new AgentSocketClient({ socketPath });
  const logLimiter = new FixedWindowRateLimiter(
    LOG_RATE_LIMIT_PER_WINDOW,
    LOG_RATE_LIMIT_WINDOW_MS,
  );
  const metricLimiter = new FixedWindowRateLimiter(
    METRIC_RATE_LIMIT_PER_WINDOW,
    METRIC_RATE_LIMIT_WINDOW_MS,
  );

  function send(message: LocalMessage): void {
    client.send(message);
  }

  return {
    async start() {
      client.connect();
    },
    ready(info) {
      send({
        type: "bot.ready",
        payload: {
          botId,
          guildCount: info.guildCount,
          shardCount: info.shardCount,
          version: info.version,
        },
      });
    },
    heartbeat(info) {
      send({
        type: "bot.heartbeat",
        payload: {
          botId,
          shardCount: info.shardCount,
          guildCount: info.guildCount,
          pingMs: info.pingMs,
        },
      });
    },
    metric(metric, value, unit) {
      if (!metricLimiter.tryConsume()) return;
      send({ type: "bot.metrics", payload: { botId, metric, value, unit } });
    },
    log(level, message) {
      if (!logLimiter.tryConsume()) return;
      const truncated =
        message.length > MAX_LOG_MESSAGE_LENGTH
          ? message.slice(0, MAX_LOG_MESSAGE_LENGTH)
          : message;
      send({ type: "bot.log", payload: { botId, level, message: truncated } });
    },
    shardStatus(info) {
      send({
        type: "shard.status",
        payload: {
          botId,
          shardId: info.shardId,
          status: info.status,
          guildCount: info.guildCount,
          pingMs: info.pingMs,
        },
      });
    },
    crashed(safeError) {
      send({ type: "bot.crashed", payload: { botId, safeError } });
    },
    async gracefulShutdown() {
      send({ type: "bot.stopped", payload: { botId } });
      client.close();
    },
  };
}
