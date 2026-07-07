// Placeholder bot process spawned by the PM2/Docker runner adapters
// (lib/runner/pm2-adapter.ts, lib/runner/docker-adapter.ts). This is
// deliberately NOT a real discord.js/Eris client - see
// lib/plugins/builtin/bot-templates.ts for what a real one looks like.
// It exists so "start/stop/restart a bot" spawns and controls a real OS
// process (or container) today, without needing a real Discord bot token
// this project doesn't have.
//
// BOTFLEET_BOT_TOKEN is read here (in-memory only) exactly the way a real
// client's `client.login(token)` call would - it is never logged, never
// written to disk, and never sent anywhere by this script.

const botId = process.env.BOTFLEET_BOT_ID ?? "unknown";
const hasToken = Boolean(process.env.BOTFLEET_BOT_TOKEN);

console.log(`[bot ${botId}] starting (token present: ${hasToken})`);
console.log(`[bot ${botId}] placeholder process - a real client would call client.login() here`);

const heartbeat = setInterval(() => {
  console.log(`[bot ${botId}] heartbeat ${new Date().toISOString()}`);
}, 5000);

function shutdown(signal) {
  console.log(`[bot ${botId}] received ${signal}, shutting down`);
  clearInterval(heartbeat);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
