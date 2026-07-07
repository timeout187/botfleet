import { z } from "zod";
import { drainModeSchema, idempotencyKeySchema } from "./common";

const agentAcceptedPayload = z.object({
  agentId: z.string().min(1),
  agentCredentialFingerprint: z.string().min(1),
  heartbeatIntervalMs: z.number().int().positive(),
});

const agentRotateCertificatePayload = z.object({
  agentId: z.string().min(1),
  newCertificateRef: z.string().min(1),
});

/** Every start/stop/restart/move/update command below shares this shape -
 * `idempotencyKey` is mandatory so re-delivering the same command after a
 * reconnect is a no-op on the agent, never a duplicate action. */
const workloadCommandPayload = z.object({
  workloadId: z.string().min(1),
  botId: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

const botMovePayload = workloadCommandPayload.extend({
  targetAgentId: z.string().min(1),
});

/** `specification` is intentionally loose here (Phase 6's workload
 * specification package owns the real shape and validates it before a
 * command is ever sent) - this schema only guarantees it's a JSON object,
 * not an arbitrary shell string. */
const botUpdatePayload = workloadCommandPayload.extend({
  specification: z.record(z.string(), z.unknown()),
});

const workerDrainPayload = z.object({
  agentId: z.string().min(1),
  mode: drainModeSchema,
  idempotencyKey: idempotencyKeySchema,
});

const deploymentPreparePayload = z.object({
  deploymentId: z.string().min(1),
  workloadId: z.string().min(1),
  artifactRef: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

const deploymentExecutePayload = z.object({
  deploymentId: z.string().min(1),
  workloadId: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

const deploymentRollbackPayload = z.object({
  deploymentId: z.string().min(1),
  workloadId: z.string().min(1),
  targetReleaseId: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

const configurationRefreshPayload = z.object({
  agentId: z.string().min(1),
});

/** Discriminated union of every message the control plane can send to an
 * agent. See agent-to-control-plane.ts for the reverse direction. */
export const controlPlaneToAgentMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent.accepted"), payload: agentAcceptedPayload }),
  z.object({ type: z.literal("agent.rotate_certificate"), payload: agentRotateCertificatePayload }),
  z.object({ type: z.literal("bot.start"), payload: workloadCommandPayload }),
  z.object({ type: z.literal("bot.stop"), payload: workloadCommandPayload }),
  z.object({ type: z.literal("bot.restart"), payload: workloadCommandPayload }),
  z.object({ type: z.literal("bot.move"), payload: botMovePayload }),
  z.object({ type: z.literal("bot.update"), payload: botUpdatePayload }),
  z.object({ type: z.literal("worker.drain"), payload: workerDrainPayload }),
  z.object({ type: z.literal("deployment.prepare"), payload: deploymentPreparePayload }),
  z.object({ type: z.literal("deployment.execute"), payload: deploymentExecutePayload }),
  z.object({ type: z.literal("deployment.rollback"), payload: deploymentRollbackPayload }),
  z.object({ type: z.literal("configuration.refresh"), payload: configurationRefreshPayload }),
]);

export type ControlPlaneToAgentMessage = z.infer<typeof controlPlaneToAgentMessageSchema>;
export type ControlPlaneToAgentType = ControlPlaneToAgentMessage["type"];

export const CONTROL_PLANE_TO_AGENT_TYPES = controlPlaneToAgentMessageSchema.options.map(
  (option) => option.shape.type.value,
) as ControlPlaneToAgentType[];
