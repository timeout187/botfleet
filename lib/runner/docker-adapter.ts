import { db } from "@/lib/db";
import { BotStatus } from "@/app/generated/prisma/client";
import type { RunnerAdapter } from "@/lib/runner/types";

/**
 * DOCKER_ADAPTER_NOTES:
 * A real implementation would run one container per bot (or per worker group,
 * with multiple bot client processes inside), using the Docker Engine API
 * (e.g. dockerode) to create/start/stop/restart a container named by bot id,
 * mounting nothing but an in-memory-decrypted token as an env var passed at
 * container start (never written to disk, never logged).
 *
 * TODO(real-runner): replace the setStatus() calls below with real Docker
 * Engine API calls once container orchestration is wired up.
 */
async function setStatus(botId: string, status: (typeof BotStatus)[keyof typeof BotStatus]) {
  await db.bot.update({ where: { id: botId }, data: { status } });
  await db.botHealth.upsert({
    where: { botId },
    create: { botId, status },
    update: { status },
  });
}

export const dockerAdapter: RunnerAdapter = {
  mode: "docker",
  async start(botId) {
    await setStatus(botId, BotStatus.starting);
    // TODO(real-runner): docker.createContainer(...) + container.start()
    await setStatus(botId, BotStatus.online);
  },
  async stop(botId) {
    await setStatus(botId, BotStatus.stopping);
    // TODO(real-runner): container.stop()
    await setStatus(botId, BotStatus.offline);
  },
  async restart(botId) {
    await setStatus(botId, BotStatus.stopping);
    // TODO(real-runner): container.restart()
    await setStatus(botId, BotStatus.starting);
    await setStatus(botId, BotStatus.online);
  },
};
