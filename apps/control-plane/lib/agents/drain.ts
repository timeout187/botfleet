import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { scheduleWorkload } from "@botfleet/scheduler";
import { createControlPlaneToAgentMessage } from "@botfleet/protocol";
import { buildSchedulerContext, toSchedulerWorkload } from "@/lib/scheduling";
import {
  assignWorkloadToAgent,
  sendWorkloadCommand,
  recordAndEnqueueCommand,
} from "@/lib/workloads";
import { AgentStatus } from "@/app/generated/prisma/client";

export class AgentNotFoundError extends Error {}

export interface DrainAgentResult {
  relocated: { workloadId: string; toAgentId: string }[];
  stranded: { workloadId: string; reason: string }[];
  fullyDrained: boolean;
}

const HEALTH_CHECK_ATTEMPTS = 5;
const HEALTH_CHECK_INTERVAL_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Marks an agent `draining` and relocates every workload assigned to it
 * onto another eligible online agent, using `@botfleet/scheduler`'s real
 * scoring function (the draining agent is excluded by virtue of not
 * being `online`). See docs/reconciliation.md's "Safe draining" section.
 *
 * Ordering per workload: assign to the new agent first (bumps
 * `generation`, pushes `bot.update`, and - if the workload was running -
 * `bot.start`), poll briefly for the new agent to confirm it's actually
 * running, *then* stop the old agent. This is the same "start new before
 * stopping old" tradeoff the mission's spec calls out (minimizes
 * downtime) - it's only safe here because ownership fencing
 * (docs/reconciliation.md) catches the old agent if it's ever slow to
 * receive/act on the stop and still reports itself as the runner.
 *
 * A workload with no eligible agent is left in place and reported as
 * "stranded", exactly like `lib/workers/drain.ts`'s established
 * single-node convention - the agent stays `draining`, not fully drained,
 * until an admin adds capacity and drains again.
 */
export async function drainAgent(agentId: string, actorUserId: string): Promise<DrainAgentResult> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new AgentNotFoundError(`Agent ${agentId} not found`);

  await db.agent.update({ where: { id: agentId }, data: { status: AgentStatus.draining } });
  await writeAuditLog({
    actorUserId,
    action: "agent.drain_started",
    targetType: "agent",
    targetId: agentId,
    metadata: {},
  });

  const workloadsToMove = await db.workload.findMany({
    where: { assignedAgentId: agentId },
    include: { bot: { select: { customerId: true } } },
  });

  const result: DrainAgentResult = { relocated: [], stranded: [], fullyDrained: false };

  for (const workload of workloadsToMove) {
    // Recomputed per-workload: each relocation changes currentWorkloadCount
    // for whichever agent just received one, so the next workload's
    // scoring reflects it rather than everyone piling onto the same
    // "most free" agent.
    const { agents, customerPlacements } = await buildSchedulerContext(workload.id);
    const eligibleAgents = agents.filter((a) => a.id !== agentId);
    const schedulerWorkload = toSchedulerWorkload(workload);
    const decision = scheduleWorkload(schedulerWorkload, eligibleAgents, customerPlacements);

    if (!decision.selectedAgentId) {
      result.stranded.push({ workloadId: workload.id, reason: "no eligible agent found" });
      continue;
    }

    const targetAgentId = decision.selectedAgentId;
    const assignResult = await assignWorkloadToAgent(workload.id, targetAgentId, actorUserId);
    if (!assignResult.ok) {
      result.stranded.push({ workloadId: workload.id, reason: assignResult.reason });
      continue;
    }

    if (workload.desiredState === "running") {
      await sendWorkloadCommand(workload.id, "start", actorUserId);

      let confirmed = false;
      for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt++) {
        await sleep(HEALTH_CHECK_INTERVAL_MS);
        const current = await db.workload.findUnique({ where: { id: workload.id } });
        if (current?.observedState === "running" && current.assignedAgentId === targetAgentId) {
          confirmed = true;
          break;
        }
      }
      if (!confirmed) {
        console.warn(
          `[drain] workload ${workload.id} moved to ${targetAgentId} but wasn't confirmed running within ${HEALTH_CHECK_ATTEMPTS}s - stopping the old agent anyway to avoid a double-run; ownership fencing covers the rest`,
        );
      }
    }

    // Stop the old agent's copy regardless of health-check outcome above -
    // leaving it running would be the exact duplicate-execution scenario
    // this whole mechanism exists to prevent. `sendWorkloadCommand` always
    // targets `workload.assignedAgentId`, which is now the new agent, so
    // this is issued directly rather than through that helper. `workload`
    // here is the row fetched before `assignWorkloadToAgent` bumped the
    // generation, so `workload.generation` is exactly what the old agent
    // last knew about.
    const idempotencyKey = randomUUID();
    const stopMessage = createControlPlaneToAgentMessage(
      {
        type: "bot.stop",
        payload: {
          workloadId: workload.id,
          botId: workload.botId,
          generation: workload.generation,
          idempotencyKey,
        },
      },
      { senderId: "control-plane" },
    );
    await recordAndEnqueueCommand({
      agentId,
      workloadId: workload.id,
      commandType: "bot.stop",
      payloadJson: stopMessage.payload,
      message: stopMessage,
      actorUserId,
      idempotencyKey,
      generation: workload.generation,
    });

    result.relocated.push({ workloadId: workload.id, toAgentId: targetAgentId });
  }

  const stillAssigned = await db.workload.count({ where: { assignedAgentId: agentId } });
  result.fullyDrained = stillAssigned === 0;
  if (result.fullyDrained) {
    await db.agent.update({ where: { id: agentId }, data: { status: AgentStatus.disabled } });
  }

  await writeAuditLog({
    actorUserId,
    action: "agent.drain_completed",
    targetType: "agent",
    targetId: agentId,
    metadata: {
      relocated: result.relocated,
      stranded: result.stranded,
      fullyDrained: result.fullyDrained,
    },
  });

  return result;
}
