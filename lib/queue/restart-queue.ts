import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";

export const RESTART_QUEUE_NAME = "botfleet-deployment-restarts";
export const STAGGERED_RESTART_JOB_NAME = "staggered-restart";

/** Delay between each bot's restart job, so a fleet-wide deployment never
 * restarts every bot at once. */
export const RESTART_STAGGER_MS = 15_000;

export interface StaggeredRestartJobData {
  botId: string;
  deploymentId: string;
  actorUserId: string;
}

function createQueue() {
  return new Queue<StaggeredRestartJobData>(RESTART_QUEUE_NAME, {
    connection: getQueueConnection(),
  });
}

let queue: ReturnType<typeof createQueue> | undefined;

function getQueue() {
  if (!queue) {
    queue = createQueue();
  }
  return queue;
}

/**
 * Enqueues one delayed restart job per bot, each `RESTART_STAGGER_MS` apart,
 * and returns immediately - the actual restarts run in the worker process
 * (lib/queue/ai-worker.ts), never inline in the deployment request handler.
 * Each job re-checks maintenance mode and the bot/worker's live status right
 * before restarting (see processStaggeredRestart), since a lot can change
 * during the minutes a large fleet takes to stagger through.
 */
export async function enqueueStaggeredRestarts(
  botIds: string[],
  deploymentId: string,
  actorUserId: string,
): Promise<number> {
  await Promise.all(
    botIds.map((botId, index) =>
      getQueue().add(
        STAGGERED_RESTART_JOB_NAME,
        { botId, deploymentId, actorUserId },
        {
          delay: index * RESTART_STAGGER_MS,
          jobId: `staggered-restart:${deploymentId}:${botId}`,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 3600 },
        },
      ),
    ),
  );
  return botIds.length;
}
