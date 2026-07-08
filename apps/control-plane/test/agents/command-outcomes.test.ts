import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { markCommandOutcome } from "@/lib/agent-gateway/command-outcomes";
import {
  AgentStatus,
  WorkloadDesiredState,
  WorkloadObservedState,
} from "@/app/generated/prisma/client";

/**
 * markCommandOutcome() is the only place Workload.observedState is ever
 * written (lib/agent-gateway/server.ts's agent.command_result handler,
 * and its "agent not connected" dispatch-failure path). This test covers
 * a real bug found and fixed during the v0.1.0 stabilization pass: a
 * command result from an agent that is no longer a workload's assigned
 * agent (e.g. the explicit "stop the old copy" drainAgent() issues to a
 * just-relocated-away agent) must not be allowed to overwrite
 * observedState the *current* agent already reported - otherwise a
 * slow/stale success response corrupts fleet state even though nothing
 * is actually wrong.
 */
describe("markCommandOutcome", () => {
  async function makeAgent(name: string) {
    return db.agent.create({
      data: {
        name,
        status: AgentStatus.online,
        protocolVersion: 1,
        agentVersion: "test",
        labelsJson: {},
        capabilitiesJson: ["node"],
        hostname: "test-host",
        architecture: "x64",
        operatingSystem: "linux",
      },
    });
  }

  it("updates observedState when the result comes from the workload's current agent", async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await db.user.create({ data: { email: `outcome-test-${suffix}@example.com` } });
    const customer = await db.customer.create({
      data: { ownerUserId: user.id, name: `outcome-test-customer-${suffix}` },
    });
    const bot = await db.bot.create({
      data: {
        customerId: customer.id,
        name: `outcome-test-bot-${suffix}`,
        clientId: `client-${suffix}`,
        tokenEncrypted: "not-a-real-token",
      },
    });
    const agent = await makeAgent(`outcome-agent-${suffix}`);
    const workload = await db.workload.create({
      data: {
        botId: bot.id,
        specificationJson: { apiVersion: "botfleet.io/v1", kind: "DiscordBot" },
        specificationVersion: "botfleet.io/v1",
        desiredState: WorkloadDesiredState.running,
        observedState: WorkloadObservedState.stopped,
        assignedAgentId: agent.id,
        generation: 1,
      },
    });
    const idempotencyKey = randomUUID();
    await db.agentCommand.create({
      data: {
        agentId: agent.id,
        workloadId: workload.id,
        commandType: "bot.start",
        payloadJson: {},
        idempotencyKey,
        generation: 1,
      },
    });

    try {
      await markCommandOutcome(idempotencyKey, true, null);

      const updated = await db.workload.findUnique({ where: { id: workload.id } });
      expect(updated?.observedState).toBe(WorkloadObservedState.running);
      expect(updated?.observedGeneration).toBe(1);
    } finally {
      await db.agentCommand.deleteMany({ where: { workloadId: workload.id } });
      await db.workload.delete({ where: { id: workload.id } });
      await db.bot.delete({ where: { id: bot.id } });
      await db.customer.delete({ where: { id: customer.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.agent.delete({ where: { id: agent.id } });
    }
  });

  it("does NOT update observedState when the result comes from an agent that is no longer assigned (the drain-relocation bug)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await db.user.create({ data: { email: `outcome-test2-${suffix}@example.com` } });
    const customer = await db.customer.create({
      data: { ownerUserId: user.id, name: `outcome-test2-customer-${suffix}` },
    });
    const bot = await db.bot.create({
      data: {
        customerId: customer.id,
        name: `outcome-test2-bot-${suffix}`,
        clientId: `client2-${suffix}`,
        tokenEncrypted: "not-a-real-token",
      },
    });
    const oldAgent = await makeAgent(`outcome-old-agent-${suffix}`);
    const newAgent = await makeAgent(`outcome-new-agent-${suffix}`);
    // Simulates the post-relocation state: the workload is now assigned
    // to newAgent (generation bumped), and is genuinely running there.
    const workload = await db.workload.create({
      data: {
        botId: bot.id,
        specificationJson: { apiVersion: "botfleet.io/v1", kind: "DiscordBot" },
        specificationVersion: "botfleet.io/v1",
        desiredState: WorkloadDesiredState.running,
        observedState: WorkloadObservedState.running,
        assignedAgentId: newAgent.id,
        generation: 2,
        observedGeneration: 2,
      },
    });
    // The stale "stop the old copy" command drainAgent() issued to
    // oldAgent, at the pre-relocation generation.
    const idempotencyKey = randomUUID();
    await db.agentCommand.create({
      data: {
        agentId: oldAgent.id,
        workloadId: workload.id,
        commandType: "bot.stop",
        payloadJson: {},
        idempotencyKey,
        generation: 1,
      },
    });

    try {
      // oldAgent reports success stopping its (now-irrelevant) copy.
      await markCommandOutcome(idempotencyKey, true, null);

      const command = await db.agentCommand.findUnique({ where: { idempotencyKey } });
      expect(command?.status).toBe("succeeded"); // the command row itself still records what really happened

      const updated = await db.workload.findUnique({ where: { id: workload.id } });
      expect(updated?.observedState).toBe(WorkloadObservedState.running); // NOT clobbered to "stopped"
      expect(updated?.assignedAgentId).toBe(newAgent.id);
    } finally {
      await db.agentCommand.deleteMany({ where: { workloadId: workload.id } });
      await db.workload.delete({ where: { id: workload.id } });
      await db.bot.delete({ where: { id: bot.id } });
      await db.customer.delete({ where: { id: customer.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.agent.deleteMany({ where: { id: { in: [oldAgent.id, newAgent.id] } } });
    }
  });
});
