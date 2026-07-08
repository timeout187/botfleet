import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  cacheWorkloadSpec,
  startWorkload,
  stopWorkload,
  isRunning,
  getRunningInventory,
} from "../src/workload-runner";

// Every test here spawns a real Node child process (a trivial one-liner
// via `node -e`) - never mocked - the same way the rest of this project
// verifies process control (see docs/roadmap.md's PM2 adapter notes).

function nodeSpec(code: string, gracefulShutdownTimeoutSeconds = 1) {
  return {
    apiVersion: "botfleet.io/v1",
    kind: "DiscordBot",
    metadata: { name: "test-workload" },
    spec: {
      runtime: { type: "node", command: "node", args: ["-e", code] },
      runner: { type: "node" },
      health: { gracefulShutdownTimeoutSeconds },
    },
  };
}

describe("workload-runner (real child processes)", () => {
  const activeWorkloadIds: string[] = [];

  afterEach(async () => {
    for (const id of activeWorkloadIds.splice(0)) {
      await stopWorkload(id);
    }
  });

  it("rejects starting a workload with no cached spec", () => {
    const result = startWorkload(randomUUID());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no spec cached/);
  });

  it("rejects an invalid spec at cache time", () => {
    const workloadId = randomUUID();
    const result = cacheWorkloadSpec(workloadId, "bot-1", { not: "a valid spec" }, 1);
    expect(result.ok).toBe(false);
  });

  it("spawns and tracks a real process, then stops it", async () => {
    const workloadId = randomUUID();
    activeWorkloadIds.push(workloadId);

    const cacheResult = cacheWorkloadSpec(
      workloadId,
      "bot-1",
      nodeSpec("setInterval(() => {}, 60000)"),
      1,
    );
    expect(cacheResult.ok).toBe(true);

    const startResult = startWorkload(workloadId);
    expect(startResult.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(isRunning(workloadId)).toBe(true);
    expect(getRunningInventory()).toContainEqual({ workloadId, botId: "bot-1", generation: 1 });

    const stopResult = await stopWorkload(workloadId);
    expect(stopResult.ok).toBe(true);
    expect(isRunning(workloadId)).toBe(false);
    expect(getRunningInventory().some((w) => w.workloadId === workloadId)).toBe(false);
  });

  it("rejects starting the same workload twice while already running", async () => {
    const workloadId = randomUUID();
    activeWorkloadIds.push(workloadId);

    cacheWorkloadSpec(workloadId, "bot-1", nodeSpec("setInterval(() => {}, 60000)"), 1);
    expect(startWorkload(workloadId).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const secondStart = startWorkload(workloadId);
    expect(secondStart.ok).toBe(false);
    expect(secondStart.error).toMatch(/already running/);
  });

  it("force-kills a process that ignores SIGTERM once the grace period elapses", async () => {
    const workloadId = randomUUID();
    activeWorkloadIds.push(workloadId);

    // Ignores SIGTERM entirely - only a SIGKILL (from the force-kill
    // timer) can end it.
    cacheWorkloadSpec(
      workloadId,
      "bot-1",
      nodeSpec("process.on('SIGTERM', () => {}); setInterval(() => {}, 60000);"),
      1,
    );
    startWorkload(workloadId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(isRunning(workloadId)).toBe(true);

    const stopResult = await stopWorkload(workloadId);
    expect(stopResult.ok).toBe(true);
    expect(isRunning(workloadId)).toBe(false);
  }, 15_000);

  it("reports success stopping a workload that already exited on its own", async () => {
    const workloadId = randomUUID();
    activeWorkloadIds.push(workloadId);

    cacheWorkloadSpec(workloadId, "bot-1", nodeSpec("process.exit(0)"), 1);
    startWorkload(workloadId);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(isRunning(workloadId)).toBe(false);

    const stopResult = await stopWorkload(workloadId);
    expect(stopResult.ok).toBe(true);
  });
});
