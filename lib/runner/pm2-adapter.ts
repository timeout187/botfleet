import { db } from "@/lib/db";
import { BotStatus } from "@/app/generated/prisma/client";
import type { RunnerAdapter } from "@/lib/runner/types";

/**
 * PM2_ADAPTER_NOTES:
 * A real implementation would shell out to (or use the `pm2` npm API for)
 * `pm2 start ecosystem.<botId>.config.js`, `pm2 stop <name>`, `pm2 restart <name>`,
 * with one PM2 process per bot client (named by bot id) inside the worker
 * this bot is assigned to. That requires the worker process itself to run
 * this code (not the Next.js web process), decrypt the token in-memory only,
 * and report heartbeats back via the workers/bot_health tables.
 *
 * TODO(real-runner): replace the setStatus() calls below with actual `pm2`
 * process control once a worker runtime exists to host it.
 */
async function setStatus(botId: string, status: (typeof BotStatus)[keyof typeof BotStatus]) {
  await db.bot.update({ where: { id: botId }, data: { status } });
  await db.botHealth.upsert({
    where: { botId },
    create: { botId, status },
    update: { status },
  });
}

export const pm2Adapter: RunnerAdapter = {
  mode: "pm2",
  async start(botId) {
    await setStatus(botId, BotStatus.starting);
    // TODO(real-runner): pm2.start(...)
    await setStatus(botId, BotStatus.online);
  },
  async stop(botId) {
    await setStatus(botId, BotStatus.stopping);
    // TODO(real-runner): pm2.stop(...)
    await setStatus(botId, BotStatus.offline);
  },
  async restart(botId) {
    await setStatus(botId, BotStatus.stopping);
    // TODO(real-runner): pm2.restart(...)
    await setStatus(botId, BotStatus.starting);
    await setStatus(botId, BotStatus.online);
  },
};
