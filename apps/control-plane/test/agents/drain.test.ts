import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { drainAgent, AgentNotFoundError } from "@/lib/agents/drain";
import { AgentStatus, WorkloadDesiredState, WorkloadObservedState } from "@/app/generated/prisma/client";

/**
 * Exercises drainAgent() against the real dev Postgres DB + real Redis
 * (BullMQ enqueue) - no agent-gateway process is running during these
 * tests, so enqueued commands are never actually delivered/executed; the
 * assertions are about what drainAgent() itself does (relocation,
 * stranding, the old agent getting a stop command, status transitions),
 * not about a live agent's response. Live agent behavior is covered by
 * this repo's manual end-to-end verification (docs/reconciliation.md).
 *
 * drainAgent() runs the real scheduler over *every* agent row in the
 * database, so - unlike reconciliation.test.ts, which never touches the
 * scheduler - each test here must clean up its own agents/workloads
 * before the next test runs, not just at the very end. Otherwise a
 * previous test's still-online agent would be a valid (wrong) relocation
 * target for a later test expecting "no eligible agent".
 */
describe("drainAgent", () => {
  interface TestFixtures {
    userIds: string[];
    customerIds: string[];
    botIds: string[];
    agentIds: string[];
    workloadIds: string[];
  }

  function newFixtures(): TestFixtures {
    return { userIds: [], customerIds: [], botIds: [], agentIds: [], workloadIds: [] };
  }

  async function cleanup(f: TestFixtures): Promise<void> {
    await db.agentCommand.deleteMany({ where: { workloadId: { in: f.workloadIds } } });
    await db.workload.deleteMany({ where: { id: { in: f.workloadIds } } });
    await db.bot.deleteMany({ where: { id: { in: f.botIds } } });
    await db.customer.deleteMany({ where: { id: { in: f.customerIds } } });
    await db.user.deleteMany({ where: { id: { in: f.userIds } } });
    await db.agent.deleteMany({ where: { id: { in: f.agentIds } } });
  }

  async function makeAgent(f: TestFixtures, name: string) {
    const agent = await db.agent.create({
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
        totalMemoryMb: 4096,
        availableMemoryMb: 4096,
      },
    });
    f.agentIds.push(agent.id);
    return agent;
  }

  async function makeWorkload(
    f: TestFixtures,
    params: {
      agentId: string;
      desiredState: WorkloadDesiredState;
      observedState: WorkloadObservedState;
    },
  ) {
    const suffix = randomUUID().slice(0, 8);
    const user = await db.user.create({ data: { email: `drain-test-${suffix}@example.com` } });
    f.userIds.push(user.id);

    const customer = await db.customer.create({
      data: { ownerUserId: user.id, name: `drain-test-customer-${suffix}` },
    });
    f.customerIds.push(customer.id);

    const bot = await db.bot.create({
      data: {
        customerId: customer.id,
        name: `drain-test-bot-${suffix}`,
        clientId: `client-${suffix}`,
        tokenEncrypted: "not-a-real-token",
      },
    });
    f.botIds.push(bot.id);

    const workload = await db.workload.create({
      data: {
        botId: bot.id,
        specificationJson: {
          apiVersion: "botfleet.io/v1",
          kind: "DiscordBot",
          spec: { runner: { type: "node" }, resources: { memoryMb: 64 } },
        },
        specificationVersion: "botfleet.io/v1",
        desiredState: params.desiredState,
        observedState: params.observedState,
        assignedAgentId: params.agentId,
        generation: 1,
      },
    });
    f.workloadIds.push(workload.id);
    return workload;
  }

  /** `writeAuditLog`'s `actorUserId` has a real FK to `User` - drainAgent
   * is always admin-initiated (unlike reconciliation's `null` system
   * actor), so tests need a real row to satisfy it, not a fake string. */
  async function makeActor(f: TestFixtures): Promise<string> {
    const user = await db.user.create({
      data: { email: `drain-test-actor-${randomUUID().slice(0, 8)}@example.com` },
    });
    f.userIds.push(user.id);
    return user.id;
  }

  it("throws AgentNotFoundError for an unknown agent", async () => {
    const f = newFixtures();
    try {
      const actorId = await makeActor(f);
      await expect(drainAgent(randomUUID(), actorId)).rejects.toBeInstanceOf(AgentNotFoundError);
    } finally {
      await cleanup(f);
    }
  });

  it("relocates a stopped workload to another eligible agent and disables the source agent", async () => {
    const f = newFixtures();
    try {
      const actorId = await makeActor(f);
      const source = await makeAgent(f, `drain-source-a-${randomUUID().slice(0, 8)}`);
      const target = await makeAgent(f, `drain-target-a-${randomUUID().slice(0, 8)}`);
      const workload = await makeWorkload(f, {
        agentId: source.id,
        desiredState: WorkloadDesiredState.stopped,
        observedState: WorkloadObservedState.stopped,
      });

      const result = await drainAgent(source.id, actorId);

      expect(result.relocated).toEqual([{ workloadId: workload.id, toAgentId: target.id }]);
      expect(result.stranded).toEqual([]);
      expect(result.fullyDrained).toBe(true);

      const updatedAgent = await db.agent.findUnique({ where: { id: source.id } });
      expect(updatedAgent?.status).toBe(AgentStatus.disabled);

      const updatedWorkload = await db.workload.findUnique({ where: { id: workload.id } });
      expect(updatedWorkload?.assignedAgentId).toBe(target.id);
      expect(updatedWorkload?.generation).toBe(2);

      const oldAgentStopCommand = await db.agentCommand.findFirst({
        where: { agentId: source.id, workloadId: workload.id, commandType: "bot.stop" },
      });
      expect(oldAgentStopCommand).not.toBeNull();
      expect(oldAgentStopCommand?.generation).toBe(1);
    } finally {
      await cleanup(f);
    }
  });

  it("strands a workload when no other eligible agent exists", async () => {
    const f = newFixtures();
    try {
      const actorId = await makeActor(f);
      const source = await makeAgent(f, `drain-source-b-${randomUUID().slice(0, 8)}`);
      const workload = await makeWorkload(f, {
        agentId: source.id,
        desiredState: WorkloadDesiredState.stopped,
        observedState: WorkloadObservedState.stopped,
      });

      const result = await drainAgent(source.id, actorId);

      expect(result.relocated).toEqual([]);
      expect(result.stranded).toEqual([
        { workloadId: workload.id, reason: "no eligible agent found" },
      ]);
      expect(result.fullyDrained).toBe(false);

      const updatedAgent = await db.agent.findUnique({ where: { id: source.id } });
      expect(updatedAgent?.status).toBe(AgentStatus.draining);

      const updatedWorkload = await db.workload.findUnique({ where: { id: workload.id } });
      expect(updatedWorkload?.assignedAgentId).toBe(source.id);
    } finally {
      await cleanup(f);
    }
  });

  it(
    "relocates a running workload, issues a start on the new agent, and stops the old one",
    async () => {
      const f = newFixtures();
      try {
        const actorId = await makeActor(f);
        const source = await makeAgent(f, `drain-source-c-${randomUUID().slice(0, 8)}`);
        const target = await makeAgent(f, `drain-target-c-${randomUUID().slice(0, 8)}`);
        const workload = await makeWorkload(f, {
          agentId: source.id,
          desiredState: WorkloadDesiredState.running,
          observedState: WorkloadObservedState.running,
        });

        const result = await drainAgent(source.id, actorId);

        expect(result.relocated).toEqual([{ workloadId: workload.id, toAgentId: target.id }]);

        const startCommand = await db.agentCommand.findFirst({
          where: { agentId: target.id, workloadId: workload.id, commandType: "bot.start" },
        });
        expect(startCommand).not.toBeNull();

        const stopCommand = await db.agentCommand.findFirst({
          where: { agentId: source.id, workloadId: workload.id, commandType: "bot.stop" },
        });
        expect(stopCommand).not.toBeNull();
      } finally {
        await cleanup(f);
      }
    },
    15_000,
  );
});
