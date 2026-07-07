import { z } from "zod";
import {
  agentCapabilitySchema,
  agentLabelsSchema,
  agentStatusSchema,
  resourceSnapshotSchema,
  botRuntimeStatusSchema,
  shardRuntimeStatusSchema,
  logLevelSchema,
} from "./common";

const agentEnrollPayload = z.object({
  enrollmentToken: z.string().min(1),
  agentName: z.string().min(1).max(128),
  hostname: z.string().min(1).max(256),
  architecture: z.string().min(1).max(64),
  operatingSystem: z.string().min(1).max(128),
  agentVersion: z.string().min(1).max(64),
  capabilities: z.array(agentCapabilitySchema).min(1),
  labels: agentLabelsSchema,
  /** Agent's public key, for the control plane to record against the
   * agent identity it creates - see docs/agent-enrollment.md. */
  publicKey: z.string().max(8192).optional(),
});

const agentHeartbeatPayload = z.object({
  agentId: z.string().min(1),
  status: agentStatusSchema,
  resources: resourceSnapshotSchema,
  workloadCount: z.number().int().nonnegative(),
});

const agentInventoryPayload = z.object({
  agentId: z.string().min(1),
  workloads: z.array(
    z.object({
      workloadId: z.string().min(1),
      botId: z.string().min(1),
      runtimeStatus: botRuntimeStatusSchema,
    }),
  ),
});

const agentMetricsPayload = z.object({
  agentId: z.string().min(1),
  samples: z
    .array(
      z.object({
        metric: z.string().min(1).max(128),
        value: z.number(),
        unit: z.string().max(32).optional(),
      }),
    )
    .max(500),
});

const agentCommandAckPayload = z.object({
  agentId: z.string().min(1),
  commandId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(128),
});

const agentCommandResultPayload = z.object({
  agentId: z.string().min(1),
  commandId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(128),
  status: z.enum(["succeeded", "failed"]),
  /** Never a raw stack trace or secret value - callers must redact before
   * this crosses the wire. */
  safeError: z.string().max(2000).optional(),
});

const botStatusPayload = z.object({
  botId: z.string().min(1),
  status: botRuntimeStatusSchema,
});

const botHeartbeatPayload = z.object({
  botId: z.string().min(1),
  shardCount: z.number().int().nonnegative(),
  guildCount: z.number().int().nonnegative(),
  pingMs: z.number().int().nonnegative().optional(),
});

const botReadyPayload = z.object({
  botId: z.string().min(1),
  guildCount: z.number().int().nonnegative(),
  shardCount: z.number().int().nonnegative(),
  version: z.string().max(64).optional(),
});

const botStoppedPayload = z.object({
  botId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const botCrashedPayload = z.object({
  botId: z.string().min(1),
  safeError: z.string().max(2000),
});

const botMetricsPayload = z.object({
  botId: z.string().min(1),
  metric: z.string().min(1).max(128),
  value: z.number(),
  unit: z.string().max(32).optional(),
});

/** Rate-limited/size-capped at the schema level - see runtime-sdk's own
 * client-side throttling for the enforcement half of this contract. */
const botLogPayload = z.object({
  botId: z.string().min(1),
  level: logLevelSchema,
  message: z.string().min(1).max(2000),
});

const shardStatusPayload = z.object({
  botId: z.string().min(1),
  shardId: z.number().int().nonnegative(),
  status: shardRuntimeStatusSchema,
  guildCount: z.number().int().nonnegative(),
  pingMs: z.number().int().nonnegative().optional(),
});

const deploymentProgressPayload = z.object({
  deploymentId: z.string().min(1),
  workloadId: z.string().min(1),
  phase: z.string().min(1).max(64),
  message: z.string().max(500).optional(),
});

const deploymentResultPayload = z.object({
  deploymentId: z.string().min(1),
  workloadId: z.string().min(1),
  status: z.enum(["succeeded", "failed", "rolled_back"]),
  safeError: z.string().max(2000).optional(),
});

/** Discriminated union of every message an agent can send to the control
 * plane. Each variant's `payload` is validated by its own schema above -
 * this is the catalog `parseAgentToControlPlaneMessage` (index.ts)
 * dispatches on. */
export const agentToControlPlaneMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent.enroll"), payload: agentEnrollPayload }),
  z.object({ type: z.literal("agent.heartbeat"), payload: agentHeartbeatPayload }),
  z.object({ type: z.literal("agent.inventory"), payload: agentInventoryPayload }),
  z.object({ type: z.literal("agent.metrics"), payload: agentMetricsPayload }),
  z.object({ type: z.literal("agent.command_ack"), payload: agentCommandAckPayload }),
  z.object({ type: z.literal("agent.command_result"), payload: agentCommandResultPayload }),
  z.object({ type: z.literal("bot.status"), payload: botStatusPayload }),
  z.object({ type: z.literal("bot.heartbeat"), payload: botHeartbeatPayload }),
  z.object({ type: z.literal("bot.ready"), payload: botReadyPayload }),
  z.object({ type: z.literal("bot.stopped"), payload: botStoppedPayload }),
  z.object({ type: z.literal("bot.crashed"), payload: botCrashedPayload }),
  z.object({ type: z.literal("bot.metrics"), payload: botMetricsPayload }),
  z.object({ type: z.literal("bot.log"), payload: botLogPayload }),
  z.object({ type: z.literal("shard.status"), payload: shardStatusPayload }),
  z.object({ type: z.literal("deployment.progress"), payload: deploymentProgressPayload }),
  z.object({ type: z.literal("deployment.result"), payload: deploymentResultPayload }),
]);

export type AgentToControlPlaneMessage = z.infer<typeof agentToControlPlaneMessageSchema>;
export type AgentToControlPlaneType = AgentToControlPlaneMessage["type"];

export const AGENT_TO_CONTROL_PLANE_TYPES = agentToControlPlaneMessageSchema.options.map(
  (option) => option.shape.type.value,
) as AgentToControlPlaneType[];
