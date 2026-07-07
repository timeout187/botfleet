/**
 * Plain connection options (not an ioredis instance) so BullMQ's own
 * bundled ioredis client constructs the connection itself - passing an
 * instance from the top-level `ioredis` dependency (used elsewhere, e.g.
 * lib/plugins/builtin/redis-status-card.ts) trips up on the two packages
 * having structurally-incompatible nested ioredis types.
 */
export interface QueueConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
}

export function getQueueConnection(): QueueConnectionOptions {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not set - the AI worker queue is not configured.");
  }
  const url = new URL(process.env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}
