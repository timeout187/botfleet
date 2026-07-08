import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { enqueueAgentCommand } from "@/lib/queue/agent-command-queue";
import { createControlPlaneToAgentMessage } from "@botfleet/protocol";
import {
  parseWorkloadSpec,
  WORKLOAD_SPEC_API_VERSION,
  type WorkloadSpec,
} from "@botfleet/workload-spec";
import type { Prisma } from "@/app/generated/prisma/client";

export type CreateWorkloadResult =
  { ok: true; workloadId: string } | { ok: false; issues: string[] };

/**
 * Validates a raw, admin-provided JSON value as a WorkloadSpec
 * (@botfleet/workload-spec) before ever persisting it - the database
 * never holds an unvalidated spec, and nothing downstream (an agent
 * receiving a `bot.update` command) has to re-derive trust in it beyond
 * the agent's own defense-in-depth re-validation.
 */
export async function createWorkload(
  botId: string,
  rawSpec: unknown,
  actorUserId: string,
): Promise<CreateWorkloadResult> {
  const parsed = parseWorkloadSpec(rawSpec);
  if (!parsed.ok) {
    return { ok: false, issues: parsed.issues };
  }

  const workload = await db.workload.create({
    data: {
      botId,
      specificationJson: parsed.spec as unknown as Prisma.InputJsonValue,
      specificationVersion: WORKLOAD_SPEC_API_VERSION,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "workload.create",
    targetType: "workload",
    targetId: workload.id,
    metadata: { botId, specName: parsed.spec.metadata.name },
  });

  return { ok: true, workloadId: workload.id };
}

/**
 * Records a durable `AgentCommand` row and enqueues its delivery. Exported
 * (not just used internally) so `lib/agent-gateway/server.ts` can issue a
 * fencing stop straight to a stale agent - one that's no longer
 * `workload.assignedAgentId` - using the exact same recording path as
 * every admin-initiated command, just with an explicit `agentId` that
 * isn't derived from the workload's current assignment.
 */
export async function recordAndEnqueueCommand(params: {
  agentId: string;
  workloadId: string | null;
  commandType: string;
  payloadJson: unknown;
  message: unknown;
  actorUserId: string | null;
  idempotencyKey: string;
  generation?: number;
}): Promise<void> {
  await db.agentCommand.create({
    data: {
      agentId: params.agentId,
      workloadId: params.workloadId,
      commandType: params.commandType,
      payloadJson: params.payloadJson as Prisma.InputJsonValue,
      idempotencyKey: params.idempotencyKey,
      createdById: params.actorUserId,
      generation: params.generation,
    },
  });
  await enqueueAgentCommand({ agentId: params.agentId, message: params.message });
}

export type AssignWorkloadResult = { ok: true } | { ok: false; reason: string };

/**
 * Assigns a workload to an agent and pushes its spec via `bot.update` -
 * the agent caches the spec by workloadId (apps/agent/src/workload-runner.ts)
 * so a later `bot.start` doesn't need to carry the spec again.
 *
 * Bumps `generation` on every call, including reassignment to a
 * different agent (evacuation/drain) - this is the fencing token
 * (docs/reconciliation.md's "Ownership fencing"): the previous agent, if
 * it reconnects after a partition still believing it owns this workload,
 * reports a generation that no longer matches, and gets fenced.
 */
export async function assignWorkloadToAgent(
  workloadId: string,
  agentId: string,
  actorUserId: string,
): Promise<AssignWorkloadResult> {
  const workload = await db.workload.findUnique({ where: { id: workloadId } });
  if (!workload) return { ok: false, reason: "workload not found" };

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, reason: "agent not found" };

  const previousAgentId = workload.assignedAgentId;
  const updated = await db.workload.update({
    where: { id: workloadId },
    data: { assignedAgentId: agentId, generation: { increment: 1 } },
  });

  const idempotencyKey = randomUUID();
  const message = createControlPlaneToAgentMessage(
    {
      type: "bot.update",
      payload: {
        workloadId,
        botId: workload.botId,
        generation: updated.generation,
        specification: workload.specificationJson as Record<string, unknown>,
        idempotencyKey,
      },
    },
    { senderId: "control-plane" },
  );

  await recordAndEnqueueCommand({
    agentId,
    workloadId,
    commandType: "bot.update",
    payloadJson: message.payload,
    message,
    actorUserId,
    idempotencyKey,
    generation: updated.generation,
  });

  await writeAuditLog({
    actorUserId,
    action: "workload.assign",
    targetType: "workload",
    targetId: workloadId,
    metadata: { agentId, previousAgentId, generation: updated.generation },
  });

  return { ok: true };
}

export type WorkloadCommandType = "start" | "stop" | "restart";

export type SendWorkloadCommandResult = { ok: true } | { ok: false; reason: string };

export async function sendWorkloadCommand(
  workloadId: string,
  commandType: WorkloadCommandType,
  actorUserId: string | null,
): Promise<SendWorkloadCommandResult> {
  const workload = await db.workload.findUnique({ where: { id: workloadId } });
  if (!workload) return { ok: false, reason: "workload not found" };
  if (!workload.assignedAgentId) return { ok: false, reason: "workload has no assigned agent" };

  const idempotencyKey = randomUUID();
  const messageType =
    commandType === "start" ? "bot.start" : commandType === "stop" ? "bot.stop" : "bot.restart";
  const message = createControlPlaneToAgentMessage(
    {
      type: messageType,
      payload: {
        workloadId,
        botId: workload.botId,
        generation: workload.generation,
        idempotencyKey,
      },
    },
    { senderId: "control-plane" },
  );

  await recordAndEnqueueCommand({
    agentId: workload.assignedAgentId,
    workloadId,
    commandType: messageType,
    payloadJson: message.payload,
    message,
    actorUserId,
    idempotencyKey,
    generation: workload.generation,
  });

  const desiredState = commandType === "stop" ? "stopped" : "running";
  await db.workload.update({ where: { id: workloadId }, data: { desiredState } });

  await writeAuditLog({
    actorUserId,
    action: `workload.${commandType}`,
    targetType: "workload",
    targetId: workloadId,
    metadata: { agentId: workload.assignedAgentId },
  });

  return { ok: true };
}

/**
 * Issues an unconditional `bot.stop` to an agent that reported (via
 * `agent.inventory`) that it's still running a workload it no longer
 * owns - the actual split-brain/duplicate-execution prevention mechanism
 * (docs/reconciliation.md's "Ownership fencing"). Called only from
 * `lib/agent-gateway/server.ts`'s `handleInventory`, never from an admin
 * action - this always targets the *stale* agent, which is why it can't
 * reuse `sendWorkloadCommand` (that function always targets
 * `workload.assignedAgentId`, the current owner).
 */
export async function fenceStaleAgent(params: {
  staleAgentId: string;
  workloadId: string;
  botId: string;
  staleGeneration: number;
}): Promise<void> {
  const idempotencyKey = randomUUID();
  const message = createControlPlaneToAgentMessage(
    {
      type: "bot.stop",
      payload: {
        workloadId: params.workloadId,
        botId: params.botId,
        generation: params.staleGeneration,
        idempotencyKey,
      },
    },
    { senderId: "control-plane" },
  );

  await recordAndEnqueueCommand({
    agentId: params.staleAgentId,
    workloadId: params.workloadId,
    commandType: "bot.stop",
    payloadJson: message.payload,
    message,
    actorUserId: null,
    idempotencyKey,
    generation: params.staleGeneration,
  });

  await writeAuditLog({
    actorUserId: null,
    action: "workload.fence_stop",
    targetType: "workload",
    targetId: params.workloadId,
    metadata: {
      staleAgentId: params.staleAgentId,
      staleGeneration: params.staleGeneration,
      reason: "agent reported running a workload no longer assigned to it",
    },
  });
}

export type { WorkloadSpec };
