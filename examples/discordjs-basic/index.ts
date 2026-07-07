/**
 * Minimal discord.js bot wired into BotFleet's runtime SDK. Run with a
 * real (throwaway test) DISCORD_BOT_TOKEN to see a real gateway
 * connection reported through to an agent's local socket, or leave
 * DISCORD_BOT_TOKEN unset to see everything up to (but not including)
 * `client.login()` still work - the runtime/adapter/local-IPC path
 * doesn't need a live Discord session to be exercised.
 *
 * Never commit a real token - see .env.example.
 */
import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { createBotFleetRuntime } from "@botfleet/runtime-sdk";
import { attachDiscordJs } from "@botfleet/adapter-discordjs";

const botId = process.env.BOTFLEET_BOT_ID;
const socketPath = process.env.BOTFLEET_AGENT_SOCKET;
const token = process.env.DISCORD_BOT_TOKEN;

if (!botId || !socketPath) {
  throw new Error(
    "BOTFLEET_BOT_ID and BOTFLEET_AGENT_SOCKET must be set - copy .env.example to .env.",
  );
}

const runtime = createBotFleetRuntime({ botId, socketPath });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Wires client "ready"/shard events into runtime.ready()/heartbeat()/
// shardStatus() automatically - see @botfleet/adapter-discordjs.
const detach = attachDiscordJs(client, runtime);

async function main() {
  await runtime.start();
  runtime.log("info", "Runtime started, connecting to the agent's local socket");

  if (!token) {
    runtime.log("warn", "DISCORD_BOT_TOKEN not set - skipping client.login()");
    return;
  }
  await client.login(token);
}

async function shutdown() {
  detach();
  client.destroy();
  await runtime.gracefulShutdown();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err) => {
  runtime.log("error", `Failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
