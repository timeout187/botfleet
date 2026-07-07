/**
 * Minimal Eris bot wired into BotFleet's runtime SDK - the Eris
 * equivalent of ../discordjs-basic. Never commit a real token - see
 * .env.example.
 */
import "dotenv/config";
import * as Eris from "eris";
import { createBotFleetRuntime } from "@botfleet/runtime-sdk";
import { attachEris } from "@botfleet/adapter-eris";

const botId = process.env.BOTFLEET_BOT_ID;
const socketPath = process.env.BOTFLEET_AGENT_SOCKET;
const token = process.env.DISCORD_BOT_TOKEN;

if (!botId || !socketPath) {
  throw new Error(
    "BOTFLEET_BOT_ID and BOTFLEET_AGENT_SOCKET must be set - copy .env.example to .env.",
  );
}

const runtime = createBotFleetRuntime({ botId, socketPath });
const bot = new Eris.Client(token ?? "placeholder-token-not-used-without-connect", {
  intents: ["guilds"],
});

const detach = attachEris(bot, runtime);

async function main() {
  await runtime.start();
  runtime.log("info", "Runtime started, connecting to the agent's local socket");

  if (!token) {
    runtime.log("warn", "DISCORD_BOT_TOKEN not set - skipping bot.connect()");
    return;
  }
  await bot.connect();
}

async function shutdown() {
  detach();
  bot.disconnect({ reconnect: false });
  await runtime.gracefulShutdown();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err) => {
  runtime.log("error", `Failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
