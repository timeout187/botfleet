import type { BotFleetPlugin } from "@/lib/plugins/types";

export const botTemplatesPlugin: BotFleetPlugin = {
  id: "bot-templates",
  name: "Bot Templates",
  description: "Starter snippets for wiring a new bot client into BotFleet.",
  botTemplates: [
    {
      id: "discord.js",
      name: "discord.js",
      runtime: "Node.js",
      description: "Minimal discord.js v14 client, ready to register under a BotFleet worker.",
      code: `import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(\`Logged in as \${client.user?.tag}\`);
  // TODO(real-runner): report readiness back to BotFleet's bot_health table.
});

client.login(process.env.BOT_TOKEN); // decrypted in-memory by the worker, never written to disk`,
    },
    {
      id: "eris",
      name: "Eris",
      runtime: "Node.js",
      description: "Minimal Eris client, ready to register under a BotFleet worker.",
      code: `import Eris from "eris";

const bot = Eris(process.env.BOT_TOKEN); // decrypted in-memory by the worker, never written to disk

bot.on("ready", () => {
  console.log("Ready!");
  // TODO(real-runner): report readiness back to BotFleet's bot_health table.
});

bot.connect();`,
    },
  ],
};
