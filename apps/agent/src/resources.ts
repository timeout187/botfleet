import os from "node:os";
import fs from "node:fs";
import type { ResourceSnapshot } from "@botfleet/protocol";

function cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

/** Real CPU usage sampled over a short window (idle-vs-total tick delta),
 * not an instantaneous /proc snapshot or the load-average approximation -
 * both would be misleading for a value reported every heartbeat. */
async function sampleCpuUsagePercent(sampleMs = 200): Promise<number> {
  const start = cpuTimes();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = cpuTimes();
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta)));
}

async function diskStats(): Promise<{ diskTotalMb?: number; diskAvailableMb?: number }> {
  try {
    const stat = await fs.promises.statfs("/");
    const bytesPerMb = 1024 * 1024;
    return {
      diskTotalMb: Math.round((stat.blocks * stat.bsize) / bytesPerMb),
      diskAvailableMb: Math.round((stat.bavail * stat.bsize) / bytesPerMb),
    };
  } catch {
    // statfs isn't available on every platform this agent might run on
    // (e.g. some Windows configurations) - omit rather than fake it.
    return {};
  }
}

export async function sampleResources(): Promise<ResourceSnapshot> {
  const [cpuUsagePercent, disk] = await Promise.all([sampleCpuUsagePercent(), diskStats()]);
  const loadAvg = os.loadavg();
  return {
    cpuUsagePercent,
    memoryTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
    memoryAvailableMb: Math.round(os.freemem() / (1024 * 1024)),
    ...disk,
    loadAverage1m: loadAvg[0],
    loadAverage5m: loadAvg[1],
    loadAverage15m: loadAvg[2],
  };
}
