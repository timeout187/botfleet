import { describe, it, expect } from "vitest";
import { scheduleWorkload } from "../src/schedule";
import type { SchedulerAgent, SchedulerWorkload } from "../src/types";

function agent(overrides: Partial<SchedulerAgent> & { id: string }): SchedulerAgent {
  return {
    name: overrides.id,
    status: "online",
    region: null,
    environment: null,
    capabilities: [],
    labels: {},
    totalMemoryMb: 8192,
    availableMemoryMb: 4096,
    currentWorkloadCount: 0,
    ...overrides,
  };
}

function workload(overrides: Partial<SchedulerWorkload> = {}): SchedulerWorkload {
  return {
    id: "workload-1",
    customerId: "customer-1",
    requiredLabels: {},
    preferredLabels: {},
    ...overrides,
  };
}

describe("scheduleWorkload - hard requirements", () => {
  it("excludes a non-online agent", () => {
    const agents = [agent({ id: "a1", status: "draining" }), agent({ id: "a2" })];
    const result = scheduleWorkload(workload(), agents);
    expect(result.selectedAgentId).toBe("a2");
    const a1 = result.candidates.find((c) => c.agentId === "a1")!;
    expect(a1.eligible).toBe(false);
    expect(a1.ineligibleReason).toMatch(/draining/);
  });

  it("excludes an agent missing a required capability", () => {
    const agents = [
      agent({ id: "a1", capabilities: ["pm2"] }),
      agent({ id: "a2", capabilities: ["docker"] }),
    ];
    const result = scheduleWorkload(workload({ requiredCapability: "docker" }), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("excludes an agent missing a required label", () => {
    const agents = [
      agent({ id: "a1", labels: { region: "us-east" } }),
      agent({ id: "a2", labels: { region: "eu-central" } }),
    ];
    const result = scheduleWorkload(
      workload({ requiredLabels: { region: "eu-central" } }),
      agents,
    );
    expect(result.selectedAgentId).toBe("a2");
  });

  it("excludes an agent without enough available memory", () => {
    const agents = [
      agent({ id: "a1", availableMemoryMb: 256 }),
      agent({ id: "a2", availableMemoryMb: 4096 }),
    ];
    const result = scheduleWorkload(workload({ requiredMemoryMb: 1024 }), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("excludes an agent at its workload capacity", () => {
    const agents = [
      agent({ id: "a1", currentWorkloadCount: 5, maxWorkloads: 5 }),
      agent({ id: "a2", currentWorkloadCount: 2, maxWorkloads: 5 }),
    ];
    const result = scheduleWorkload(workload(), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("excludes an agent with the wrong environment", () => {
    const agents = [
      agent({ id: "a1", environment: "staging" }),
      agent({ id: "a2", environment: "production" }),
    ];
    const result = scheduleWorkload(workload({ requiredEnvironment: "production" }), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("returns no selection when every agent is ineligible", () => {
    const agents = [agent({ id: "a1", status: "disabled" }), agent({ id: "a2", status: "disconnected" })];
    const result = scheduleWorkload(workload(), agents);
    expect(result.selectedAgentId).toBeNull();
    expect(result.reason).toMatch(/no eligible/i);
  });

  it("never returns an ineligible agent as the winner even if it would score highest", () => {
    // a1 would win on region/label preferences alone, but it's draining.
    const agents = [
      agent({ id: "a1", status: "draining", region: "eu-central", labels: { runner: "docker" } }),
      agent({ id: "a2", region: "us-east" }),
    ];
    const result = scheduleWorkload(
      workload({ preferredRegion: "eu-central", preferredLabels: { runner: "docker" } }),
      agents,
    );
    expect(result.selectedAgentId).toBe("a2");
  });
});

describe("scheduleWorkload - soft preferences", () => {
  it("prefers a matching region", () => {
    const agents = [
      agent({ id: "a1", region: "us-east" }),
      agent({ id: "a2", region: "eu-central" }),
    ];
    const result = scheduleWorkload(workload({ preferredRegion: "eu-central" }), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("prefers lower memory pressure", () => {
    const agents = [
      agent({ id: "a1", totalMemoryMb: 8192, availableMemoryMb: 512 }), // high pressure
      agent({ id: "a2", totalMemoryMb: 8192, availableMemoryMb: 7000 }), // low pressure
    ];
    const result = scheduleWorkload(workload(), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("applies a customer anti-affinity bonus away from an agent already hosting the same customer", () => {
    const agents = [agent({ id: "a1" }), agent({ id: "a2" })];
    const result = scheduleWorkload(workload({ customerId: "customer-1" }), agents, [
      { customerId: "customer-1", agentId: "a1" },
    ]);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("penalizes an agent with recent failures", () => {
    const agents = [
      agent({ id: "a1", recentFailureCount: 3 }),
      agent({ id: "a2", recentFailureCount: 0 }),
    ];
    const result = scheduleWorkload(workload(), agents);
    expect(result.selectedAgentId).toBe("a2");
  });

  it("gives a stability bonus to the workload's current agent, all else equal", () => {
    const agents = [agent({ id: "a1" }), agent({ id: "a2" })];
    const result = scheduleWorkload(workload({ currentAgentId: "a1" }), agents);
    expect(result.selectedAgentId).toBe("a1");
  });

  it("breaks exact ties deterministically by agentId, not insertion order", () => {
    const agents = [agent({ id: "z-agent" }), agent({ id: "a-agent" })];
    const result = scheduleWorkload(workload(), agents);
    expect(result.selectedAgentId).toBe("a-agent");
  });

  it("is deterministic across repeated calls with the same input", () => {
    const agents = [
      agent({ id: "a1", region: "eu-central", recentFailureCount: 1 }),
      agent({ id: "a2", region: "us-east" }),
      agent({ id: "a3", region: "eu-central" }),
    ];
    const w = workload({ preferredRegion: "eu-central" });
    const results = Array.from({ length: 5 }, () => scheduleWorkload(w, agents));
    const selections = results.map((r) => r.selectedAgentId);
    expect(new Set(selections).size).toBe(1);
  });

  it("produces a human-readable score breakdown for the winner", () => {
    const agents = [
      agent({ id: "eu-03", region: "eu-central", capabilities: ["docker"], recentFailureCount: 1 }),
    ];
    const result = scheduleWorkload(
      workload({ preferredRegion: "eu-central", requiredCapability: "docker" }),
      agents,
    );
    const winner = result.candidates[0];
    expect(winner.eligible).toBe(true);
    expect(winner.breakdown.length).toBeGreaterThan(0);
    expect(winner.breakdown.some((b) => b.label.includes("region"))).toBe(true);
    expect(winner.breakdown.some((b) => b.points < 0)).toBe(true); // failure penalty
  });
});
