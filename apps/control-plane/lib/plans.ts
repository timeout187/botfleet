import { PlanTier } from "@/app/generated/prisma/client";

export interface PlanLimits {
  maxBots: number;
  maxGuildsPerBot: number;
  maxShardsPerBot: number;
  logRetentionDays: number;
  restartControlsAllowed: boolean;
  customBrandingAllowed: boolean;
  priorityWorkerAllowed: boolean;
  aiWorkerAllowed: boolean;
}

/**
 * Built-in plan tiers. "custom" plans are represented in the DB by the same
 * PlanTier.custom value on a customer/bot row; a custom plan's actual limits
 * are expected to be layered in via an admin-configurable override (see
 * docs/api-reference for the shape) - this map provides the fallback used
 * until that override exists, so custom never silently means "unlimited".
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  [PlanTier.free]: {
    maxBots: 1,
    maxGuildsPerBot: 50,
    maxShardsPerBot: 1,
    logRetentionDays: 3,
    restartControlsAllowed: false,
    customBrandingAllowed: false,
    priorityWorkerAllowed: false,
    aiWorkerAllowed: false,
  },
  [PlanTier.starter]: {
    maxBots: 3,
    maxGuildsPerBot: 250,
    maxShardsPerBot: 2,
    logRetentionDays: 7,
    restartControlsAllowed: true,
    customBrandingAllowed: false,
    priorityWorkerAllowed: false,
    aiWorkerAllowed: false,
  },
  [PlanTier.pro]: {
    maxBots: 10,
    maxGuildsPerBot: 2500,
    maxShardsPerBot: 8,
    logRetentionDays: 30,
    restartControlsAllowed: true,
    customBrandingAllowed: true,
    priorityWorkerAllowed: true,
    aiWorkerAllowed: true,
  },
  [PlanTier.enterprise]: {
    maxBots: 100,
    maxGuildsPerBot: 100_000,
    maxShardsPerBot: 256,
    logRetentionDays: 90,
    restartControlsAllowed: true,
    customBrandingAllowed: true,
    priorityWorkerAllowed: true,
    aiWorkerAllowed: true,
  },
  [PlanTier.custom]: {
    maxBots: 10,
    maxGuildsPerBot: 2500,
    maxShardsPerBot: 8,
    logRetentionDays: 30,
    restartControlsAllowed: true,
    customBrandingAllowed: true,
    priorityWorkerAllowed: true,
    aiWorkerAllowed: true,
  },
};

export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export function assertGuildLimitWithinPlan(plan: PlanTier, guildLimit: number): void {
  const limits = getPlanLimits(plan);
  if (guildLimit > limits.maxGuildsPerBot) {
    throw new PlanLimitError(
      `Guild limit ${guildLimit} exceeds the ${plan} plan's cap of ${limits.maxGuildsPerBot}.`,
    );
  }
}

export function assertShardCountWithinPlan(plan: PlanTier, shardCount: number): void {
  const limits = getPlanLimits(plan);
  if (shardCount > limits.maxShardsPerBot) {
    throw new PlanLimitError(
      `Shard count ${shardCount} exceeds the ${plan} plan's cap of ${limits.maxShardsPerBot}.`,
    );
  }
}

export function assertBotCountWithinPlan(plan: PlanTier, currentBotCount: number): void {
  const limits = getPlanLimits(plan);
  if (currentBotCount >= limits.maxBots) {
    throw new PlanLimitError(
      `This customer already has ${currentBotCount} bot(s), the ${plan} plan's cap.`,
    );
  }
}
