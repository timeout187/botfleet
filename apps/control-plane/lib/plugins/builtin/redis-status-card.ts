import Redis from "ioredis";
import type { BotFleetPlugin } from "@/lib/plugins/types";

/**
 * A real dashboard-card plugin: pings the Redis instance reserved for the
 * (not-yet-built) AI worker queue. Uses a short connect timeout and
 * lazyConnect so a down/unconfigured Redis never hangs the Fleet Overview
 * page - it just reports "unreachable".
 */
export const redisStatusPlugin: BotFleetPlugin = {
  id: "redis-status",
  name: "Redis Status",
  description:
    "Reports whether the Redis instance (reserved for the AI worker queue) is reachable.",
  dashboardCards: [
    {
      id: "redis-connectivity",
      title: "Queue backend (Redis)",
      async render() {
        const url = process.env.REDIS_URL;
        if (!url) {
          return { label: "Queue backend", value: "Not configured", tone: "neutral" };
        }
        const client = new Redis(url, {
          lazyConnect: true,
          connectTimeout: 1000,
          maxRetriesPerRequest: 0,
        });
        try {
          await client.connect();
          await client.ping();
          return { label: "Queue backend", value: "Reachable", tone: "success" };
        } catch {
          return { label: "Queue backend", value: "Unreachable", tone: "danger" };
        } finally {
          client.disconnect();
        }
      },
    },
  ],
};
