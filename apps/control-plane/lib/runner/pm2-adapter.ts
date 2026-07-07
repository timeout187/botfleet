import { db } from "@/lib/db";
import { BotStatus } from "@/app/generated/prisma/client";
import { decryptSecret } from "@/lib/crypto";
import type { RunnerAdapter } from "@/lib/runner/types";
import {
  pm2StartBotProcess,
  pm2StopProcess,
  pm2DeleteProcess,
  pm2RestartProcess,
} from "@/lib/runner/pm2-client";

/**
 * Spawns a real OS process per bot via PM2's programmatic API
 * (lib/runner/pm2-client.ts), running worker-runtime/bot-process.js - a
 * placeholder client (see that file's header comment for exactly why it's
 * not a real discord.js/Eris client). The bot's token is decrypted
 * in-memory right here and passed as an env var to the spawned process;
 * it is never logged or written to disk by this module.
 */
async function setStatus(botId: string, status: (typeof BotStatus)[keyof typeof BotStatus]) {
  await db.bot.update({ where: { id: botId }, data: { status } });
  await db.botHealth.upsert({
    where: { botId },
    create: { botId, status },
    update: { status },
  });
}

function processName(botId: string): string {
  return `botfleet-bot-${botId}`;
}

export const pm2Adapter: RunnerAdapter = {
  mode: "pm2",
  async start(botId) {
    await setStatus(botId, BotStatus.starting);
    const bot = await db.bot.findUniqueOrThrow({ where: { id: botId } });
    const token = decryptSecret(bot.tokenEncrypted);
    await pm2StartBotProcess(processName(botId), {
      BOTFLEET_BOT_ID: botId,
      BOTFLEET_BOT_TOKEN: token,
    });
    await setStatus(botId, BotStatus.online);
  },
  async stop(botId) {
    await setStatus(botId, BotStatus.stopping);
    await pm2StopProcess(processName(botId));
    await pm2DeleteProcess(processName(botId));
    await setStatus(botId, BotStatus.offline);
  },
  async restart(botId) {
    await setStatus(botId, BotStatus.stopping);
    try {
      await pm2RestartProcess(processName(botId));
    } catch {
      // Nothing running under this name yet (e.g. never started before) -
      // fall back to a fresh start rather than erroring out.
      const bot = await db.bot.findUniqueOrThrow({ where: { id: botId } });
      const token = decryptSecret(bot.tokenEncrypted);
      await pm2StartBotProcess(processName(botId), {
        BOTFLEET_BOT_ID: botId,
        BOTFLEET_BOT_TOKEN: token,
      });
    }
    await setStatus(botId, BotStatus.online);
  },
};
