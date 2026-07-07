import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";

export const AI_QUEUE_NAME = "botfleet-ai-tasks";

export interface ExplainCrashJobData {
  botId: string;
  /** Must already be redacted - lastErrorSafe, never a token or raw stack trace with secrets. */
  errorMessage: string;
}

function createQueue() {
  return new Queue<ExplainCrashJobData>(AI_QUEUE_NAME, { connection: getQueueConnection() });
}

let queue: ReturnType<typeof createQueue> | undefined;

function getQueue() {
  if (!queue) {
    queue = createQueue();
  }
  return queue;
}

/**
 * Enqueues an advisory-only crash-explanation task. This function only
 * ever runs on the trusted server; the job payload is a botId + an
 * already-redacted error string - never a token. The actual analysis runs
 * in a separate worker process (lib/queue/ai-worker.ts), never inline in
 * a request handler.
 */
export async function enqueueCrashExplanation(data: ExplainCrashJobData): Promise<string> {
  const job = await getQueue().add("explain-crash", data, {
    // Cache: identical (botId, errorMessage) pairs reuse the same job ID for
    // an hour, so repeatedly clicking "explain" on the same crash doesn't
    // re-run analysis or spam the queue.
    jobId: `explain-crash:${data.botId}:${hashError(data.errorMessage)}`,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 3600 },
  });
  return job.id ?? "";
}

export async function getCrashExplanationJob(jobId: string) {
  return getQueue().getJob(jobId);
}

function hashError(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    hash = (hash * 31 + message.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
