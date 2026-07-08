import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { fenceStaleAgent } from "@/lib/workloads";
import {
  AgentStatus,
  WorkloadDesiredState,
  WorkloadObservedState,
} from "@/app/generated/prisma/client";

/**
 * fenceStaleAgent() is the actual mechanism behind
 * docs/reconciliation.md's "Ownership fencing" - called by
 * lib/agent-gateway/server.ts's handleInventory() whenever a connected
 * agent reports (via agent.inventory) that it's still running a workload
 * `Workload.assignedAgentId` says belongs to someone else. This test
 * exercises the function directly against the real dev DB; the full
 * live path (a real stale agent's heartbeat triggering this) is verified
 * manually per docs/reconciliation.md.
 */
describe("fenceStaleAgent", () => {
  it("records a bot.stop AgentCommand targeting the stale agent and audits it", async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await db.user.create({ data: { email: `fence-test-${suffix}@example.com` } });
    const customer = await db.customer.create({
      data: { ownerUserId: user.id, name: `fence-test-customer-${suffix}` },
    });
    const bot = await db.bot.create({
      data: {
        customerId: customer.id,
        name: `fence-test-bot-${suffix}`,
        clientId: `client-${suffix}`,
        tokenEncrypted: "not-a-real-token",
      },
    });
    const staleAgent = await db.agent.create({
      data: {
        name: `fence-stale-agent-${suffix}`,
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
    const currentAgent = await db.agent.create({
      data: {
        name: `fence-current-agent-${suffix}`,
        status: AgentStatus.online,
        protocolVersion: 1,
        agentVersion: "test",
        labelsJson: {},
        capabilitiesJson: ["node"],
        hostname: "test-host-2",
        architecture: "x64",
        operatingSystem: "linux",
      },
    });
    const workload = await db.workload.create({
      data: {
        botId: bot.id,
        specificationJson: { apiVersion: "botfleet.io/v1", kind: "DiscordBot" },
        specificationVersion: "botfleet.io/v1",
        desiredState: WorkloadDesiredState.running,
        observedState: WorkloadObservedState.running,
        assignedAgentId: currentAgent.id,
        generation: 3,
      },
    });

    try {
      await fenceStaleAgent({
        staleAgentId: staleAgent.id,
        workloadId: workload.id,
        botId: bot.id,
        staleGeneration: 2,
      });

      const command = await db.agentCommand.findFirst({
        where: { agentId: staleAgent.id, workloadId: workload.id },
      });
      expect(command?.commandType).toBe("bot.stop");
      expect(command?.generation).toBe(2);

      const auditEntry = await db.auditLog.findFirst({
        where: { action: "workload.fence_stop", targetId: workload.id },
        orderBy: { createdAt: "desc" },
      });
      expect(auditEntry).not.toBeNull();
      expect((auditEntry?.metadataJson as { staleAgentId?: string })?.staleAgentId).toBe(
        staleAgent.id,
      );

      // The current (correct) owner is untouched - fencing only ever
      // targets the stale agent, never the real one.
      const currentAgentCommand = await db.agentCommand.findFirst({
        where: { agentId: currentAgent.id, workloadId: workload.id },
      });
      expect(currentAgentCommand).toBeNull();
    } finally {
      await db.agentCommand.deleteMany({ where: { workloadId: workload.id } });
      await db.workload.delete({ where: { id: workload.id } });
      await db.bot.delete({ where: { id: bot.id } });
      await db.customer.delete({ where: { id: customer.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.agent.deleteMany({ where: { id: { in: [staleAgent.id, currentAgent.id] } } });
    }
  });
});
