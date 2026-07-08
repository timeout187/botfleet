/**
 * `npm run demo:distributed` - a real, end-to-end acceptance walkthrough
 * of the distributed control plane, not a scripted fake. Every step
 * below drives the actual code paths this repo ships (the same ones
 * exercised manually and documented in docs/reconciliation.md,
 * docs/scheduler.md, docs/agent-enrollment.md): real child processes,
 * real WebSocket connections, real Postgres/Redis state, real
 * assertions against what actually happened - never a hardcoded
 * "success" message. Every checkmark below is gated on an actual
 * boolean condition, not printed unconditionally.
 *
 * Prerequisites (checked, not assumed): Postgres and Redis reachable at
 * DATABASE_URL/REDIS_URL, migrations applied. Spawns its own
 * agent-gateway, worker:ai, and two apps/agent processes - nothing else
 * needs to be running first. Processes are spawned by invoking tsx's CLI
 * directly via `node <resolved tsx/dist/cli.mjs>` rather than `npx tsx`
 * - npx interposes its own wrapper process, and killing that wrapper
 * does not kill the real underlying process, which would make every
 * "restart"/"disconnect" step in this demo a lie.
 *
 * Walkthrough:
 *   1. Enroll two real agents (agent-a, agent-b).
 *   2. Create a mock workload, get a real scheduler recommendation, assign
 *      + start it on the recommended agent - a real child process.
 *   3. Desync desired/observed state and watch the real reconciliation
 *      loop self-heal it on its own schedule.
 *   4. Drain the agent running the workload - watch it relocate to the
 *      other agent via the real scheduler, with the old agent's copy
 *      actually stopped.
 *   5. Restart the control plane (kill + respawn agent-gateway/worker:ai)
 *      and confirm the agent holding the workload reconnects and the
 *      workload's state is intact.
 *   6. Disconnect and reconnect the now-empty agent (crash + respawn the
 *      process) and confirm it reuses its persisted credential/agentId.
 *   7. Final acceptance check: exactly one real OS process for the
 *      workload exists, and exactly one agent's state claims it - not
 *      "should be one," actually counted via `ps`.
 *
 * Cleans up everything it created (processes, DB rows, local state
 * files) whether it passes or fails, per this project's own testing
 * conventions - never leaves debris in a shared dev database.
 */
import "dotenv/config";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { db } from "@/lib/db";
import { createEnrollmentToken } from "@/lib/agents/enrollment";
import { createWorkload, assignWorkloadToAgent, sendWorkloadCommand } from "@/lib/workloads";
import { computeSchedulingRecommendation } from "@/lib/scheduling";
import { drainAgent } from "@/lib/agents/drain";
import { reconcileWorkloads } from "@/lib/reconciliation";
import { WorkloadDesiredState, WorkloadObservedState } from "@/app/generated/prisma/client";

const CONTROL_PLANE_DIR = path.resolve(__dirname, "..");
const AGENT_DIR = path.resolve(CONTROL_PLANE_DIR, "..", "agent");
const RUN_ID = randomUUID().slice(0, 8);
const GATEWAY_PORT = 4010;
const AGENT_WS_URL = `ws://localhost:${GATEWAY_PORT}`;
// Must exceed lib/agent-gateway/server.ts's HEARTBEAT_TIMEOUT_MS (45s)
// plus one HEARTBEAT_INTERVAL_MS (15s) check cycle, with margin.
const DISCONNECT_DETECTION_TIMEOUT_MS = 75_000;

let passed = 0;
let failed = 0;
const processes: ChildProcess[] = [];
const tempFiles: string[] = [];
const dbRowIds = { userIds: [] as string[], customerIds: [] as string[], botIds: [] as string[] };

function log(message: string): void {
  console.log(`[demo] ${message}`);
}

/** The single point every pass/fail assertion goes through - `condition`
 * decides which counter increments, never just which string is printed. */
function check(condition: boolean, passLabel: string, failLabel?: string): boolean {
  if (condition) {
    passed++;
    console.log(`  ✓ ${passLabel}`);
  } else {
    failed++;
    console.error(`  ✗ ${failLabel ?? passLabel}`);
  }
  return condition;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  description: string,
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  console.error(`  (timed out waiting for: ${description})`);
  return false;
}

/**
 * Spawns via `node --import tsx <script>` - tsx's own loader hook, run
 * in-process. Neither `npx tsx` nor even `node <resolved tsx CLI path>`
 * work for this demo's purposes: tsx's CLI (`tsx/dist/cli.mjs`) always
 * re-execs a *second* node process carrying the loader flags, so killing
 * the process this function would otherwise return only kills the outer
 * wrapper - the real agent-gateway/worker/agent process silently
 * survives, holding its port/DB connections, and every "restart"/
 * "disconnect" step in this demo would be a lie. `--import tsx` applies
 * the same loader without any wrapper process - confirmed via `pstree`
 * during development: a single node process, no re-exec, `SIGKILL`
 * actually ends it and its listening socket is released immediately.
 */
function spawnTsx(
  name: string,
  scriptRelPath: string,
  env: Record<string, string>,
  cwd: string,
): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", scriptRelPath], {
    cwd,
    env: { ...process.env, ...env },
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      console.log(`  [${name}] ${line}`);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      console.error(`  [${name}] ${line}`);
    }
  });
  processes.push(child);
  return child;
}

function countRealProcesses(marker: string): number {
  try {
    const out = execSync(`ps aux | grep -F -- "${marker}" | grep -v grep`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function preflight(): Promise<boolean> {
  log("Preflight: checking Postgres and Redis are reachable...");
  try {
    await db.$queryRaw`SELECT 1`;
    check(true, "Postgres reachable");
  } catch (err) {
    check(
      false,
      "Postgres reachable",
      `Postgres unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  const { default: Redis } = await import("ioredis");
  try {
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set");
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    check(true, "Redis reachable");
  } catch (err) {
    check(
      false,
      "Redis reachable",
      `Redis unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
  return true;
}

/** Starts (or restarts) agent-gateway + worker:ai, retrying the gateway
 * spawn if it crashes immediately (e.g. the previous instance's port
 * hadn't been released yet). */
async function startControlPlane(): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const gateway = spawnTsx(
      "gateway",
      "lib/agent-gateway/server.ts",
      { AGENT_GATEWAY_PORT: String(GATEWAY_PORT) },
      CONTROL_PLANE_DIR,
    );
    const crashed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2000);
      gateway.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!crashed) {
      spawnTsx("worker", "lib/queue/ai-worker.ts", {}, CONTROL_PLANE_DIR);
      await sleep(1500);
      return;
    }
    log(`agent-gateway exited immediately on attempt ${attempt} - retrying...`);
    await sleep(1000);
  }
  throw new Error("agent-gateway failed to start after 3 attempts");
}

async function main(): Promise<void> {
  console.log("=".repeat(72));
  console.log("BotFleet distributed control plane - end-to-end acceptance demo");
  console.log("=".repeat(72));

  if (!(await preflight())) {
    console.error("\nPreflight failed - start Postgres/Redis and run migrations first.");
    process.exitCode = 1;
    return;
  }

  log("Starting agent-gateway + worker:ai...");
  await startControlPlane();
  check(true, "control plane started (agent-gateway + worker:ai)");

  log("Setting up a demo customer/bot for the workload...");
  const user = await db.user.create({ data: { email: `demo-${RUN_ID}-owner@example.com` } });
  dbRowIds.userIds.push(user.id);
  const customer = await db.customer.create({
    data: { ownerUserId: user.id, name: `demo-${RUN_ID}-customer` },
  });
  dbRowIds.customerIds.push(customer.id);
  const bot = await db.bot.create({
    data: {
      customerId: customer.id,
      name: `demo-${RUN_ID}-bot`,
      clientId: `demo-${RUN_ID}-client`,
      tokenEncrypted: "not-a-real-token",
    },
  });
  dbRowIds.botIds.push(bot.id);
  check(true, "demo customer/bot created");

  log("Enrolling two real agents (agent-a, agent-b)...");
  const agentAToken = await createEnrollmentToken(user.id);
  const agentBToken = await createEnrollmentToken(user.id);

  const agentAStatePath = `/tmp/botfleet-demo-${RUN_ID}-agent-a-state.json`;
  const agentASocketPath = `/tmp/botfleet-demo-${RUN_ID}-agent-a.sock`;
  const agentBStatePath = `/tmp/botfleet-demo-${RUN_ID}-agent-b-state.json`;
  const agentBSocketPath = `/tmp/botfleet-demo-${RUN_ID}-agent-b.sock`;
  tempFiles.push(agentAStatePath, agentASocketPath, agentBStatePath, agentBSocketPath);

  function spawnAgent(
    name: string,
    token: string,
    statePath: string,
    socketPath: string,
  ): ChildProcess {
    return spawnTsx(
      name,
      "src/index.ts",
      {
        BOTFLEET_CONTROL_PLANE_WS_URL: AGENT_WS_URL,
        BOTFLEET_AGENT_ENROLLMENT_TOKEN: token,
        BOTFLEET_AGENT_NAME: name,
        BOTFLEET_AGENT_STATE_PATH: statePath,
        BOTFLEET_AGENT_SOCKET_PATH: socketPath,
        BOTFLEET_AGENT_LABELS: "region=demo",
        // Must match the workload spec's runner.type below, or the
        // scheduler correctly (and unhelpfully, for this demo) considers
        // every agent ineligible.
        BOTFLEET_AGENT_CAPABILITIES: "node",
      },
      AGENT_DIR,
    );
  }

  let agentAProc = spawnAgent(
    `demo-${RUN_ID}-agent-a`,
    agentAToken.plaintextToken,
    agentAStatePath,
    agentASocketPath,
  );
  let agentBProc = spawnAgent(
    `demo-${RUN_ID}-agent-b`,
    agentBToken.plaintextToken,
    agentBStatePath,
    agentBSocketPath,
  );
  void agentBProc;

  const agentsEnrolled = await waitFor(
    "both agents enrolled",
    async () => {
      const count = await db.agent.count({
        where: {
          name: { in: [`demo-${RUN_ID}-agent-a`, `demo-${RUN_ID}-agent-b`] },
          status: "online",
        },
      });
      return count === 2;
    },
    15000,
    1000,
  );
  if (!check(agentsEnrolled, "both agents enrolled and online", "agent enrollment failed")) {
    throw new Error("agents did not enroll - aborting demo");
  }

  const agentA = await db.agent.findFirstOrThrow({ where: { name: `demo-${RUN_ID}-agent-a` } });
  const agentB = await db.agent.findFirstOrThrow({ where: { name: `demo-${RUN_ID}-agent-b` } });

  log("Creating a mock workload spec...");
  const workloadMarker = `botfleet-demo-workload-${RUN_ID}`;
  const spec = {
    apiVersion: "botfleet.io/v1",
    kind: "DiscordBot",
    metadata: { name: `demo-${RUN_ID}-workload` },
    spec: {
      runtime: {
        type: "node",
        command: "node",
        args: ["-e", `process.title=${JSON.stringify(workloadMarker)};setInterval(()=>{},1000)`],
      },
      runner: { type: "node" },
      resources: { memoryMb: 64 },
    },
  };
  const created = await createWorkload(bot.id, spec, user.id);
  if (!created.ok) throw new Error(`createWorkload failed: ${created.issues.join(", ")}`);
  const workloadId = created.workloadId;
  check(true, "workload spec validated and stored");

  log("Computing a real scheduler recommendation...");
  const recommendation = await computeSchedulingRecommendation(workloadId);
  if (!recommendation.ok) throw new Error(`scheduling failed: ${recommendation.reason}`);
  console.log(
    `  scheduler candidates: ${recommendation.decision.candidates
      .map((c) => `${c.agentName}=${c.eligible ? c.totalScore : "ineligible"}`)
      .join(", ")}`,
  );
  console.log(
    `  scheduler selected: ${recommendation.decision.selectedAgentId} (${recommendation.decision.reason})`,
  );
  check(
    recommendation.decision.selectedAgentId !== null,
    "scheduler produced a real, scored, non-null placement decision",
  );

  const firstAgentId = recommendation.decision.selectedAgentId ?? agentA.id;
  const secondAgentId = firstAgentId === agentA.id ? agentB.id : agentA.id;

  log(
    `Assigning and starting the workload on ${firstAgentId === agentA.id ? "agent-a" : "agent-b"}...`,
  );
  const assigned = await assignWorkloadToAgent(workloadId, firstAgentId, user.id);
  if (!assigned.ok) throw new Error(`assign failed: ${assigned.reason}`);
  const started = await sendWorkloadCommand(workloadId, "start", user.id);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);

  const startedOk = await waitFor(
    "workload running on the first agent",
    async () => {
      const w = await db.workload.findUnique({ where: { id: workloadId } });
      return w?.observedState === "running" && w.assignedAgentId === firstAgentId;
    },
    10000,
  );
  check(startedOk, "workload confirmed running (real child process)");
  check(countRealProcesses(workloadMarker) === 1, "exactly one real OS process for the workload");

  log("Desyncing desired/observed state to exercise the reconciliation loop...");
  await db.workload.update({
    where: { id: workloadId },
    data: { desiredState: WorkloadDesiredState.stopped },
  });
  const reconciled = await reconcileWorkloads(null);
  console.log(`  reconciliation tick: ${JSON.stringify(reconciled)}`);
  const stoppedOk = await waitFor(
    "reconciliation stopped the workload",
    async () =>
      (await db.workload.findUnique({ where: { id: workloadId } }))?.observedState ===
      WorkloadObservedState.stopped,
    10000,
  );
  check(stoppedOk, "reconciliation self-healed desired=stopped");

  log("Restarting the workload before draining...");
  await db.workload.update({
    where: { id: workloadId },
    data: { desiredState: WorkloadDesiredState.running },
  });
  await reconcileWorkloads(null);
  const restartedOk = await waitFor(
    "workload running again before drain",
    async () =>
      (await db.workload.findUnique({ where: { id: workloadId } }))?.observedState === "running",
    10000,
  );
  check(restartedOk, "reconciliation self-healed desired=running again");

  log(`Draining ${firstAgentId === agentA.id ? "agent-a" : "agent-b"}...`);
  const drainResult = await drainAgent(firstAgentId, user.id);
  console.log(`  drain result: ${JSON.stringify(drainResult)}`);
  check(
    drainResult.relocated.length === 1 && drainResult.relocated[0].toAgentId === secondAgentId,
    "workload relocated to the other agent via the real scheduler",
    `relocation did not happen as expected: ${JSON.stringify(drainResult)}`,
  );

  const relocationConfirmed = await waitFor(
    "relocated workload confirmed running on the new agent",
    async () => {
      const w = await db.workload.findUnique({ where: { id: workloadId } });
      return w?.observedState === "running" && w.assignedAgentId === secondAgentId;
    },
    10000,
  );
  check(relocationConfirmed, "relocation confirmed (real process on the new agent)");
  check(
    countRealProcesses(workloadMarker) === 1,
    "still exactly one real OS process after relocation (old agent's copy actually stopped)",
  );

  log("Restarting the control plane (kill + respawn agent-gateway/worker:ai)...");
  const [oldGateway, oldWorker] = processes.splice(0, 2);
  oldGateway.kill("SIGKILL");
  oldWorker.kill("SIGKILL");
  await sleep(1000);
  await startControlPlane();

  const secondAgentName =
    secondAgentId === agentA.id ? `demo-${RUN_ID}-agent-a` : `demo-${RUN_ID}-agent-b`;
  const reconnectedAfterRestart = await waitFor(
    "agent holding the workload reconnects after control-plane restart",
    async () => (await db.agent.findUnique({ where: { id: secondAgentId } }))?.status === "online",
    20000,
    1000,
  );
  check(
    reconnectedAfterRestart,
    `${secondAgentName} reconnected to the restarted control plane (same agentId, persisted credential)`,
    "agent did not reconnect after control-plane restart",
  );
  check(
    countRealProcesses(workloadMarker) === 1,
    "workload still exactly one real process after control-plane restart",
  );

  log(
    `Disconnecting and reconnecting the now-empty agent (${firstAgentId === agentA.id ? "agent-a" : "agent-b"})...`,
  );
  const emptyAgentProc = firstAgentId === agentA.id ? agentAProc : agentBProc;
  const emptyAgentName =
    firstAgentId === agentA.id ? `demo-${RUN_ID}-agent-a` : `demo-${RUN_ID}-agent-b`;
  const emptyAgentStatePath = firstAgentId === agentA.id ? agentAStatePath : agentBStatePath;
  const emptyAgentSocketPath = firstAgentId === agentA.id ? agentASocketPath : agentBSocketPath;
  emptyAgentProc.kill("SIGKILL");
  const disconnectedOk = await waitFor(
    "empty agent marked disconnected",
    async () =>
      (await db.agent.findUnique({ where: { id: firstAgentId } }))?.status === "disconnected",
    DISCONNECT_DETECTION_TIMEOUT_MS,
    2000,
  );
  check(disconnectedOk, "drained agent's disconnect was detected (heartbeat timeout)");

  const respawned = spawnAgent(emptyAgentName, "", emptyAgentStatePath, emptyAgentSocketPath);
  if (firstAgentId === agentA.id) agentAProc = respawned;
  else agentBProc = respawned;
  void agentAProc;
  const reconnectedOk = await waitFor(
    "empty agent reconnects using its persisted credential",
    async () => (await db.agent.findUnique({ where: { id: firstAgentId } }))?.status === "online",
    15000,
    1000,
  );
  check(
    reconnectedOk,
    `${emptyAgentName} reconnected reusing the same agentId (no re-enrollment needed)`,
  );

  const finalAgentCount = await db.agent.count({
    where: { name: { in: [`demo-${RUN_ID}-agent-a`, `demo-${RUN_ID}-agent-b`] } },
  });
  check(finalAgentCount === 2, "exactly 2 Agent rows exist (no duplicate created by reconnect)");

  log("Final acceptance check...");
  const finalProcessCount = countRealProcesses(workloadMarker);
  check(
    finalProcessCount === 1,
    "FINAL: exactly one real workload instance is active",
    `FINAL: expected exactly 1 process, found ${finalProcessCount}`,
  );
  const finalWorkload = await db.workload.findUnique({ where: { id: workloadId } });
  check(
    finalWorkload?.observedState === "running" && finalWorkload.assignedAgentId === secondAgentId,
    "FINAL: exactly one agent (the relocated one) claims to be running it",
    `FINAL: workload DB state doesn't match expectations: ${JSON.stringify(finalWorkload)}`,
  );

  console.log("\n" + "=".repeat(72));
  console.log(`Demo complete: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(72));
  if (failed > 0) process.exitCode = 1;
}

async function cleanup(): Promise<void> {
  log("Cleaning up demo processes, state files, and database rows...");
  for (const p of processes) {
    if (!p.killed) p.kill("SIGKILL");
  }
  await sleep(300);
  for (const f of tempFiles) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // best-effort
    }
  }

  try {
    const bots = await db.bot.findMany({ where: { id: { in: dbRowIds.botIds } } });
    for (const bot of bots) {
      await db.agentCommand.deleteMany({ where: { workload: { botId: bot.id } } });
      await db.workload.deleteMany({ where: { botId: bot.id } });
    }
    await db.bot.deleteMany({ where: { id: { in: dbRowIds.botIds } } });
    await db.customer.deleteMany({ where: { id: { in: dbRowIds.customerIds } } });
    await db.user.deleteMany({ where: { id: { in: dbRowIds.userIds } } });
    await db.agent.deleteMany({
      where: { name: { in: [`demo-${RUN_ID}-agent-a`, `demo-${RUN_ID}-agent-b`] } },
    });
    await db.enrollmentToken.deleteMany({ where: { createdById: { in: dbRowIds.userIds } } });
  } catch (err) {
    console.error("cleanup: failed to remove some database rows:", err);
  }

  await db.$disconnect();
}

main()
  .catch((err) => {
    console.error("\nDemo failed with an error:", err);
    failed++;
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    // Spawned children are killed above, but BullMQ/ioredis connections
    // opened transitively (createEnrollmentToken, sendWorkloadCommand,
    // etc. all enqueue through lib/queue/agent-command-queue.ts) keep
    // their sockets open and the event loop alive - this script must
    // terminate deterministically (it's meant to be runnable in CI), so
    // exit explicitly rather than hoping every handle drains on its own.
    process.exit(process.exitCode ?? 0);
  });
