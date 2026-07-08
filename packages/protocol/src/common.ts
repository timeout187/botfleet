import { z } from "zod";

export const agentCapabilitySchema = z.enum([
  "node",
  "pm2",
  "docker",
  "discordjs",
  "eris",
  "ai-worker",
  "custom-executable",
]);
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

/** Well-known labels get a typed shape; anything else is still accepted
 * as an arbitrary string label (`region=eu-central`-style custom keys). */
export const agentLabelsSchema = z
  .object({
    region: z.string().max(64).optional(),
    environment: z.string().max(64).optional(),
    runner: z.string().max(64).optional(),
    tier: z.string().max(64).optional(),
    architecture: z.string().max(64).optional(),
    storageClass: z.string().max(64).optional(),
  })
  .catchall(z.string().max(256));
export type AgentLabels = z.infer<typeof agentLabelsSchema>;

export const agentStatusSchema = z.enum([
  "enrolling",
  "online",
  "degraded",
  "disconnected",
  "draining",
  "maintenance",
  "disabled",
]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const resourceSnapshotSchema = z.object({
  cpuUsagePercent: z.number().min(0).max(100),
  memoryTotalMb: z.number().int().nonnegative(),
  memoryAvailableMb: z.number().int().nonnegative(),
  diskTotalMb: z.number().int().nonnegative().optional(),
  diskAvailableMb: z.number().int().nonnegative().optional(),
  loadAverage1m: z.number().nonnegative().optional(),
  loadAverage5m: z.number().nonnegative().optional(),
  loadAverage15m: z.number().nonnegative().optional(),
});
export type ResourceSnapshot = z.infer<typeof resourceSnapshotSchema>;

export const botRuntimeStatusSchema = z.enum([
  "starting",
  "online",
  "stopping",
  "offline",
  "failed",
  "rate_limited",
]);
export type BotRuntimeStatus = z.infer<typeof botRuntimeStatusSchema>;

export const shardRuntimeStatusSchema = z.enum([
  "connected",
  "connecting",
  "disconnected",
  "reconnecting",
]);
export type ShardRuntimeStatus = z.infer<typeof shardRuntimeStatusSchema>;

export const drainModeSchema = z.enum(["graceful", "immediate", "maintenance-window"]);
export type DrainMode = z.infer<typeof drainModeSchema>;

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof logLevelSchema>;

/** Every command the control plane sends to an agent must carry one, so
 * re-delivering the same command after a reconnect is a no-op on the
 * receiving end rather than a duplicate action. */
export const idempotencyKeySchema = z.string().min(1).max(128);
