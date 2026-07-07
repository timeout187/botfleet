/**
 * Executes workloads locally on this agent's machine via
 * `child_process.spawn` - real OS processes, never a shell string (the
 * workload spec's `runtime.command`/`args` are always an argv array, see
 * @botfleet/workload-spec). This is intentionally the simplest possible
 * real runner (direct spawn, not PM2/Docker) - see docs/roadmap.md for
 * why: it's the "real mock workload" vertical slice the distributed
 * mission's Phase 6 asks for, not a claim that this replaces the
 * apps/control-plane PM2/Docker adapters (which operate on a different
 * machine - the control plane's own host - and were never meant to
 * distribute in the first place; see docs/distributed-audit.md).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { parseWorkloadSpec, type WorkloadSpec } from "@botfleet/workload-spec";

interface WorkloadEntry {
  botId: string;
  spec: WorkloadSpec;
  process: ChildProcess | null;
}

const workloads = new Map<string, WorkloadEntry>();

export interface RunnerResult {
  ok: boolean;
  error?: string;
}

/** Caches a validated spec by workloadId - `bot.start`/`stop`/`restart`
 * act on whatever was last cached here, never on a spec carried in their
 * own payload (they don't have one; see docs/protocol-reference.md). */
export function cacheWorkloadSpec(
  workloadId: string,
  botId: string,
  rawSpec: unknown,
): RunnerResult {
  const parsed = parseWorkloadSpec(rawSpec);
  if (!parsed.ok) {
    return { ok: false, error: `invalid workload spec: ${parsed.issues.join("; ")}` };
  }
  const existing = workloads.get(workloadId);
  workloads.set(workloadId, { botId, spec: parsed.spec, process: existing?.process ?? null });
  return { ok: true };
}

export function startWorkload(workloadId: string): RunnerResult {
  const entry = workloads.get(workloadId);
  if (!entry) {
    return { ok: false, error: "no spec cached for this workload - a bot.update must run first" };
  }
  if (entry.process && !entry.process.killed) {
    return { ok: false, error: "already running" };
  }

  const { runtime } = entry.spec.spec;
  if (runtime.type !== "node") {
    return {
      ok: false,
      error: `runtime type "${runtime.type}" is not supported by this agent yet`,
    };
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const envVar of entry.spec.spec.env) {
    if (envVar.value !== undefined) {
      env[envVar.name] = envVar.value;
    }
    // secretRef resolution (fetching a real secret by reference rather
    // than accepting one inline) is a documented gap - see docs/roadmap.md.
  }

  const child = spawn(runtime.command, runtime.args, {
    cwd: runtime.workingDirectory,
    env,
  });
  entry.process = child;

  child.stdout?.on("data", (chunk: Buffer) => {
    console.log(`[workload ${workloadId}] ${chunk.toString().trimEnd()}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[workload ${workloadId}] ${chunk.toString().trimEnd()}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[workload ${workloadId}] exited (code=${code}, signal=${signal})`);
    entry.process = null;
  });
  child.on("error", (err) => {
    console.error(`[workload ${workloadId}] failed to spawn: ${err.message}`);
    entry.process = null;
  });

  return { ok: true };
}

export function stopWorkload(workloadId: string): Promise<RunnerResult> {
  const entry = workloads.get(workloadId);
  if (!entry) {
    return Promise.resolve({ ok: false, error: "unknown workload" });
  }
  if (!entry.process || entry.process.killed) {
    return Promise.resolve({ ok: true });
  }

  const gracefulMs = entry.spec.spec.health.gracefulShutdownTimeoutSeconds * 1000;
  const child = entry.process;

  return new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, gracefulMs);

    child.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve({ ok: true });
    });

    child.kill("SIGTERM");
  });
}

export async function restartWorkload(workloadId: string): Promise<RunnerResult> {
  const stopResult = await stopWorkload(workloadId);
  if (!stopResult.ok) return stopResult;
  return startWorkload(workloadId);
}

/** For tests/diagnostics only. */
export function isRunning(workloadId: string): boolean {
  const entry = workloads.get(workloadId);
  return Boolean(entry?.process && !entry.process.killed);
}
