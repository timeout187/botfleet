import type { Bot, BotHealth } from "@/app/generated/prisma/client";
import { getPlanLimits } from "@/lib/plans";

/**
 * The only shape a Bot row is ever allowed to leave the server as. There is
 * no `tokenEncrypted` field here - not even redacted - because the encrypted
 * value itself is still sensitive (it's useless without the master key, but
 * it should never leave the trusted backend regardless).
 */
export function serializeBot(bot: Bot) {
  return {
    id: bot.id,
    customerId: bot.customerId,
    name: bot.name,
    clientId: bot.clientId,
    hasPublicKey: Boolean(bot.publicKey),
    plan: bot.plan,
    status: bot.status,
    guildLimit: bot.guildLimit,
    shardCount: bot.shardCount,
    workerGroupId: bot.workerGroupId,
    lastReadyAt: bot.lastReadyAt,
    lastHeartbeatAt: bot.lastHeartbeatAt,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
  };
}

/**
 * What a customer is allowed to see about their own bot: status, guild
 * count, plan limits, and an invite link. No worker/shard internals, no
 * token, no other customers' data.
 */
export function serializeBotForCustomer(bot: Bot, health: BotHealth | null) {
  const limits = getPlanLimits(bot.plan);
  return {
    id: bot.id,
    name: bot.name,
    clientId: bot.clientId,
    inviteUrl: `https://discord.com/oauth2/authorize?client_id=${bot.clientId}&permissions=0&scope=bot%20applications.commands`,
    status: bot.status,
    plan: bot.plan,
    guildCount: health?.guildCount ?? 0,
    guildLimit: bot.guildLimit,
    planLimits: limits,
    lastReadyAt: bot.lastReadyAt,
    createdAt: bot.createdAt,
  };
}
