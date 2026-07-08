import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { reconcileWorkloads, clearReconciliationFailure } from "@/lib/reconciliation";
import {
  AgentCommandStatus,
  AgentStatus,
  WorkloadDesiredState,
  WorkloadObservedState,
} from "@/app/generated/prisma/client";

/**
 * Exercises reconcileWorkloads() against the real dev Postgres DB (no
 * mocked Prisma client - this repo's established pattern for anything
 * that isn't a pure function). Every row this test creates is deleted in
 * afterAll, in FK-safe order; nothing broader is ever touched.
 */
describe("reconcileWorkloads", () => {
  const suffix = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdBotIds: string[] = [];
  const createdAgentIds: string[] = [];
  const createdWorkloadIds: string[] = [];

  async function makeAgent(name: string) {
    const agent = await db.agent.create({
      data: {
        name,
        status: AgentStatus.online,
        protocolVersion: 1,
        agentVersion: "test",
        labelsJson: {},
        capabilitiesJson: ["pm2"],
        hostname: "test-host",
        architecture: "x64",
        operatingSystem: "linux",
      },
    });
    createdAgentIds.push(agent.id);
    return agent;
  }

  async function makeWorkload(params: {
    agentId: string;
    desiredState: WorkloadDesiredState;
    observedState: WorkloadObservedState;
  }) {
    const user = await db.user.create({
      data: { email: `reconcile-test-${suffix}-${createdUserIds.length}@example.com` },
    });
    createdUserIds.push(user.id);

    const customer = await db.customer.create({
      data: { ownerUserId: user.id, name: `reconcile-test-customer-${suffix}` },
    });
    createdCustomerIds.push(customer.id);

    const bot = await db.bot.create({
      data: {
        customerId: customer.id,
        name: `reconcile-test-bot-${suffix}`,
        clientId: `client-${suffix}`,
        tokenEncrypted: "not-a-real-token",
      },
    });
    createdBotIds.push(bot.id);

    const workload = await db.workload.create({
      data: {
        botId: bot.id,
        specificationJson: { apiVersion: "botfleet.io/v1", kind: "DiscordBot" },
        specificationVersion: "botfleet.io/v1",
        desiredState: params.desiredState,
        observedState: params.observedState,
        assignedAgentId: params.agentId,
      },
    });
    createdWorkloadIds.push(workload.id);
    return workload;
  }

  afterAll(async () => {
    await db.agentCommand.deleteMany({ where: { workloadId: { in: createdWorkloadIds } } });
    await db.workload.deleteMany({ where: { id: { in: createdWorkloadIds } } });
    await db.bot.deleteMany({ where: { id: { in: createdBotIds } } });
    await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await db.agent.deleteMany({ where: { id: { in: createdAgentIds } } });
  });

  it("issues a start command when desired=running but observed=stopped", async () => {
    const agent = await makeAgent(`reconcile-agent-a-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.running,
      observedState: WorkloadObservedState.stopped,
    });

    const result = await reconcileWorkloads(null);

    expect(result.skipped.find((s) => s.workloadId === workload.id)).toBeUndefined();

    const command = await db.agentCommand.findFirst({
      where: { workloadId: workload.id },
      orderBy: { createdAt: "desc" },
    });
    expect(command?.commandType).toBe("bot.start");
    expect(command?.status).toBe(AgentCommandStatus.pending);
  });

  it("issues a stop command when desired=stopped but observed=running", async () => {
    const agent = await makeAgent(`reconcile-agent-b-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.stopped,
      observedState: WorkloadObservedState.running,
    });

    await reconcileWorkloads(null);

    const command = await db.agentCommand.findFirst({
      where: { workloadId: workload.id },
      orderBy: { createdAt: "desc" },
    });
    expect(command?.commandType).toBe("bot.stop");
  });

  it("does nothing when desired and observed already agree", async () => {
    const agent = await makeAgent(`reconcile-agent-c-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.running,
      observedState: WorkloadObservedState.running,
    });

    await reconcileWorkloads(null);

    const command = await db.agentCommand.findFirst({ where: { workloadId: workload.id } });
    expect(command).toBeNull();
  });

  it("skips a workload that already has a command in flight", async () => {
    const agent = await makeAgent(`reconcile-agent-d-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.running,
      observedState: WorkloadObservedState.stopped,
    });
    await db.agentCommand.create({
      data: {
        agentId: agent.id,
        workloadId: workload.id,
        commandType: "bot.start",
        payloadJson: {},
        status: AgentCommandStatus.accepted,
        idempotencyKey: randomUUID(),
      },
    });

    const result = await reconcileWorkloads(null);

    expect(result.skipped.find((s) => s.workloadId === workload.id)?.reason).toBe(
      "a command is already in flight",
    );
    const commandCount = await db.agentCommand.count({ where: { workloadId: workload.id } });
    expect(commandCount).toBe(1);
  });

  it("skips a workload suspended after repeated failures", async () => {
    const agent = await makeAgent(`reconcile-agent-e-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.running,
      observedState: WorkloadObservedState.stopped,
    });
    await db.workload.update({
      where: { id: workload.id },
      data: { reconciliationSuspendedAt: new Date() },
    });

    const result = await reconcileWorkloads(null);

    expect(result.skipped.find((s) => s.workloadId === workload.id)?.reason).toMatch(/suspended/);
    const commandCount = await db.agentCommand.count({ where: { workloadId: workload.id } });
    expect(commandCount).toBe(0);
  });

  it("skips a workload still backing off after a recent failure", async () => {
    const agent = await makeAgent(`reconcile-agent-f-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.running,
      observedState: WorkloadObservedState.stopped,
    });
    await db.workload.update({
      where: { id: workload.id },
      data: { nextReconcileAttemptAt: new Date(Date.now() + 60_000) },
    });

    const result = await reconcileWorkloads(null);

    expect(result.skipped.find((s) => s.workloadId === workload.id)?.reason).toMatch(/backing off/);
    const commandCount = await db.agentCommand.count({ where: { workloadId: workload.id } });
    expect(commandCount).toBe(0);
  });

  it("clearReconciliationFailure resets suspension/backoff so the next tick acts again", async () => {
    const agent = await makeAgent(`reconcile-agent-g-${suffix}`);
    const workload = await makeWorkload({
      agentId: agent.id,
      desiredState: WorkloadDesiredState.running,
      observedState: WorkloadObservedState.stopped,
    });
    await db.workload.update({
      where: { id: workload.id },
      data: { reconciliationSuspendedAt: new Date(), reconcileAttempts: 5 },
    });

    await clearReconciliationFailure(workload.id);

    const cleared = await db.workload.findUnique({ where: { id: workload.id } });
    expect(cleared?.reconciliationSuspendedAt).toBeNull();
    expect(cleared?.reconcileAttempts).toBe(0);
    expect(cleared?.nextReconcileAttemptAt).toBeNull();

    const result = await reconcileWorkloads(null);
    expect(result.skipped.find((s) => s.workloadId === workload.id)).toBeUndefined();
    const command = await db.agentCommand.findFirst({ where: { workloadId: workload.id } });
    expect(command?.commandType).toBe("bot.start");
  });

  it("holds a real Postgres advisory lock for the duration of a tick", async () => {
    // Directly exercises the same lock reconcileWorkloads() takes, using
    // a separate raw connection - proves it's a real cross-connection
    // Postgres lock, not an in-process mutex that only works because
    // Node is single-threaded.
    const RECONCILE_LOCK_KEY: [number, number] = [847362, 1];
    const held = await db.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK_KEY[0]}, ${RECONCILE_LOCK_KEY[1]}) AS locked
      `;
      expect(locked).toBe(true);

      // While this transaction still holds the lock, a concurrent
      // reconcileWorkloads() tick must observe it held and do no work.
      const result = await reconcileWorkloads(null);
      expect(result.lockHeld).toBe(true);
      expect(result.checked).toBe(0);
      return locked;
    });
    expect(held).toBe(true);

    // Lock is released once the holding transaction ends - a normal
    // tick afterward acquires it again.
    const afterRelease = await reconcileWorkloads(null);
    expect(afterRelease.lockHeld).toBeFalsy();
  });
});
