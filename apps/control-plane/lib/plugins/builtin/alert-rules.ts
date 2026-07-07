import type { BotFleetPlugin } from "@/lib/plugins/types";
import { db } from "@/lib/db";
import { AlertSeverity } from "@/app/generated/prisma/client";

const HIGH_RESTART_THRESHOLD = 3;
const GUILD_LIMIT_WARN_RATIO = 0.9;

export const alertRulesPlugin: BotFleetPlugin = {
  id: "built-in-alert-rules",
  name: "Built-in Alert Rules",
  description: "Evaluates fleet state against a few common alert conditions.",
  alertRules: [
    {
      id: "high-restart-count",
      description: `Fires when any bot's restart count is >= ${HIGH_RESTART_THRESHOLD}.`,
      async evaluate() {
        const bad = await db.botHealth.findFirst({
          where: { restartCount: { gte: HIGH_RESTART_THRESHOLD } },
          include: { bot: true },
          orderBy: { restartCount: "desc" },
        });
        if (!bad) return { trigger: false };
        return {
          trigger: true,
          title: `${bad.bot.name} has restarted ${bad.restartCount} times`,
          message:
            "This usually means the bot is crash-looping. Check its last safe error and consider rotating its token.",
          severity: AlertSeverity.warning,
        };
      },
    },
    {
      id: "guild-limit-approaching",
      description: `Fires when any bot is above ${GUILD_LIMIT_WARN_RATIO * 100}% of its guild limit.`,
      async evaluate() {
        const bots = await db.bot.findMany({ include: { health: true } });
        const near = bots.find(
          (b) => b.health && b.health.guildCount / b.guildLimit >= GUILD_LIMIT_WARN_RATIO,
        );
        if (!near || !near.health) return { trigger: false };
        return {
          trigger: true,
          title: `${near.name} is approaching its guild limit`,
          message: `${near.health.guildCount} / ${near.guildLimit} guilds on the ${near.plan} plan.`,
          severity: AlertSeverity.warning,
        };
      },
    },
  ],
};
