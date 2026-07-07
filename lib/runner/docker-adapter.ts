import { db } from "@/lib/db";
import { BotStatus } from "@/app/generated/prisma/client";
import { decryptSecret } from "@/lib/crypto";
import type { RunnerAdapter } from "@/lib/runner/types";
import {
  dockerStartBotContainer,
  dockerStopBotContainer,
  dockerRestartBotContainer,
} from "@/lib/runner/docker-client";

/**
 * Spawns a real Docker container per bot (lib/runner/docker-client.ts,
 * using dockerode) running worker-runtime/bot-process.js - the same
 * placeholder client the PM2 adapter uses (see that file's header
 * comment). Build the image once with:
 *   docker build -t botfleet-worker-runtime:latest ./worker-runtime
 *
 * NOTE: this adapter's logic was implemented and typechecked, but could
 * NOT be run end-to-end in the sandbox this was built in - that
 * environment's network policy blocks pulling the node:20-slim base
 * image from Docker Hub (`docker build` fails with a 403 on the CDN),
 * even though the Docker daemon itself runs fine there. The PM2 adapter
 * (lib/runner/pm2-adapter.ts) uses the identical pattern and was verified
 * end-to-end (a real process spawned, emitted heartbeats, and was cleanly
 * torn down) - verify this adapter the same way in an environment with
 * normal Docker Hub access before relying on it.
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
    const bot = await db.bot.findUniqueOrThrow({ where: { id: botId } });
    const token = decryptSecret(bot.tokenEncrypted);
    await dockerStartBotContainer(botId, { BOTFLEET_BOT_ID: botId, BOTFLEET_BOT_TOKEN: token });
    await setStatus(botId, BotStatus.online);
  },
  async stop(botId) {
    await setStatus(botId, BotStatus.stopping);
    await dockerStopBotContainer(botId);
    await setStatus(botId, BotStatus.offline);
  },
  async restart(botId) {
    await setStatus(botId, BotStatus.stopping);
    try {
      await dockerRestartBotContainer(botId);
    } catch {
      const bot = await db.bot.findUniqueOrThrow({ where: { id: botId } });
      const token = decryptSecret(bot.tokenEncrypted);
      await dockerStartBotContainer(botId, { BOTFLEET_BOT_ID: botId, BOTFLEET_BOT_TOKEN: token });
    }
    await setStatus(botId, BotStatus.online);
  },
};
