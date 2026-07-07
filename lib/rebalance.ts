export interface RebalanceWorker {
  id: string;
  name: string;
  maxBots: number;
  currentBots: number;
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
 * moved automatically. It only ever *recommends*; an admin applies a move
 * via the existing PATCH /api/admin/bots/:id (workerGroupId).
 *
 * Strategy:
 * 1. Any bot with no worker assigned is recommended to the least-loaded
 *    worker with spare capacity.
 * 2. Any worker over its maxBots (e.g. after maxBots was lowered) has its
 *    excess bots recommended to move to the least-loaded worker with spare
 *    capacity.
 */
export function computeRebalanceRecommendations(
  workers: RebalanceWorker[],
  bots: RebalanceBot[],
): RebalanceRecommendation[] {
  const recommendations: RebalanceRecommendation[] = [];
  const load = new Map(workers.map((w) => [w.id, w.currentBots]));

  function leastLoaded(excludeWorkerId?: string): RebalanceWorker | undefined {
    return workers
      .filter((w) => w.id !== excludeWorkerId && (load.get(w.id) ?? 0) < w.maxBots)
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
    const excess = currentLoad - worker.maxBots;
    if (excess <= 0) continue;

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
        reason: `${worker.name} is over its max bots (${currentLoad}/${worker.maxBots})`,
      });
      load.set(worker.id, (load.get(worker.id) ?? 0) - 1);
      load.set(target.id, (load.get(target.id) ?? 0) + 1);
    }
  }

  return recommendations;
}
