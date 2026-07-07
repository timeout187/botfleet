export interface RebalanceWorker {
  id: string;
  name: string;
  maxBots: number;
  currentBots: number;
  /** WorkerStatus value - "online" | "offline" | "overloaded" | "failed" | "draining" */
  status: string;
}

export interface RebalanceBot {
  id: string;
  name: string;
  workerGroupId: string | null;
}

export interface RebalanceRecommendation {
  type: "move" | "assign";
  botId: string;
  botName: string;
  fromWorkerId?: string;
  fromWorkerName?: string;
  toWorkerId: string;
  toWorkerName: string;
  reason: string;
}

/**
 * Pure, deterministic rebalancing algorithm - no side effects, nothing is
 * moved automatically. It only ever *recommends*; an admin (or the drain
 * action in lib/workers/drain.ts) applies a move via setBotWorker().
 *
 * Strategy:
 * 1. Any bot with no worker assigned is recommended to the least-loaded
 *    *online* worker with spare capacity.
 * 2. Any worker over its effective capacity has its excess bots
 *    recommended to move elsewhere. A worker's effective capacity is its
 *    `maxBots` normally, but 0 if it's `draining` or `failed` - so every
 *    one of a draining worker's bots gets a move recommendation, which is
 *    exactly what "drain this worker" needs.
 * 3. Only `online` workers are ever considered as a move/assign target.
 */
export function computeRebalanceRecommendations(
  workers: RebalanceWorker[],
  bots: RebalanceBot[],
): RebalanceRecommendation[] {
  const recommendations: RebalanceRecommendation[] = [];
  const load = new Map(workers.map((w) => [w.id, w.currentBots]));

  function effectiveMax(worker: RebalanceWorker): number {
    return worker.status === "draining" || worker.status === "failed" ? 0 : worker.maxBots;
  }

  function leastLoaded(excludeWorkerId?: string): RebalanceWorker | undefined {
    return workers
      .filter(
        (w) =>
          w.id !== excludeWorkerId &&
          w.status === "online" &&
          (load.get(w.id) ?? 0) < effectiveMax(w),
      )
      .sort((a, b) => (load.get(a.id) ?? 0) / a.maxBots - (load.get(b.id) ?? 0) / b.maxBots)[0];
  }

  for (const bot of bots) {
    if (bot.workerGroupId) continue;
    const target = leastLoaded();
    if (!target) continue;
    recommendations.push({
      type: "assign",
      botId: bot.id,
      botName: bot.name,
      toWorkerId: target.id,
      toWorkerName: target.name,
      reason: "Unassigned bot - no worker currently owns it",
    });
    load.set(target.id, (load.get(target.id) ?? 0) + 1);
  }

  for (const worker of workers) {
    const currentLoad = load.get(worker.id) ?? 0;
    const max = effectiveMax(worker);
    const excess = currentLoad - max;
    if (excess <= 0) continue;

    const draining = worker.status === "draining" || worker.status === "failed";
    const overflowBots = bots.filter((b) => b.workerGroupId === worker.id).slice(0, excess);
    for (const bot of overflowBots) {
      const target = leastLoaded(worker.id);
      if (!target) continue;
      recommendations.push({
        type: "move",
        botId: bot.id,
        botName: bot.name,
        fromWorkerId: worker.id,
        fromWorkerName: worker.name,
        toWorkerId: target.id,
        toWorkerName: target.name,
        reason: draining
          ? `${worker.name} is ${worker.status} - moving its bots off`
          : `${worker.name} is over its max bots (${currentLoad}/${worker.maxBots})`,
      });
      load.set(worker.id, (load.get(worker.id) ?? 0) - 1);
      load.set(target.id, (load.get(target.id) ?? 0) + 1);
    }
  }

  return recommendations;
}
