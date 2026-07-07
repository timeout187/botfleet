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

async function recordAndEnqueueCommand(params: {
  agentId: string;
  workloadId: string;
  commandType: string;
  payloadJson: unknown;
  message: unknown;
  actorUserId: string | null;
  idempotencyKey: string;
}): Promise<void> {
  await db.agentCommand.create({
    data: {
      agentId: params.agentId,
      workloadId: params.workloadId,
      commandType: params.commandType,
      payloadJson: params.payloadJson as Prisma.InputJsonValue,
      idempotencyKey: params.idempotencyKey,
      createdById: params.actorUserId,
    },
  });
  await enqueueAgentCommand({ agentId: params.agentId, message: params.message });
}

export type AssignWorkloadResult = { ok: true } | { ok: false; reason: string };

/**
 * Assigns a workload to an agent and pushes its spec via `bot.update` -
 * the agent caches the spec by workloadId (apps/agent/src/workload-runner.ts)
 * so a later `bot.start` doesn't need to carry the spec again.
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

  await db.workload.update({ where: { id: workloadId }, data: { assignedAgentId: agentId } });

  const idempotencyKey = randomUUID();
  const message = createControlPlaneToAgentMessage(
    {
      type: "bot.update",
      payload: {
        workloadId,
        botId: workload.botId,
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
  });

  await writeAuditLog({
    actorUserId,
    action: "workload.assign",
    targetType: "workload",
    targetId: workloadId,
    metadata: { agentId },
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
      payload: { workloadId, botId: workload.botId, idempotencyKey },
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

export type { WorkloadSpec };
