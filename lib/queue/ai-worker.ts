/**
 * Standalone worker process for BotFleet's AI task queue. Run separately
 * from the Next.js web process (`npm run worker:ai`) so a slow or stuck
 * analysis job never blocks a dashboard request - this is the "must not
 * block bot event handlers" requirement from the spec, applied to the web
 * app's own request handlers today (no real bot event loop exists yet;
 * see lib/runner for that gap).
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";
import { AI_QUEUE_NAME, type ExplainCrashJobData } from "@/lib/queue/ai-queue";
import { analyzeCrash, type CrashAnalysis } from "@/lib/queue/crash-analysis";
import { writeAuditLog } from "@/lib/audit";

async function processExplainCrash(job: Job<ExplainCrashJobData>): Promise<CrashAnalysis> {
  // The job payload is only ever a botId + an already-redacted error
  // string (BotHealth.lastErrorSafe) - never a token, never a raw stack
  // trace. This function has no way to receive a secret even if it wanted to.
  const result = analyzeCrash(job.data.errorMessage);

  await writeAuditLog({
    actorUserId: null,
    action: "ai.crash_explanation",
    targetType: "bot",
    targetId: job.data.botId,
    metadata: { summary: result.summary, confidence: result.confidence },
  });

  return result;
}

const worker = new Worker<ExplainCrashJobData, CrashAnalysis>(
  AI_QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case "explain-crash":
        return processExplainCrash(job);
      default:
        throw new Error(`Unknown AI job type: ${job.name}`);
    }
  },
  { connection: getQueueConnection(), concurrency: 2 },
);

worker.on("completed", (job) => {
  console.log(`[ai-worker] completed ${job.id} (${job.name})`);
});
worker.on("failed", (job, err) => {
  console.error(`[ai-worker] failed ${job?.id} (${job?.name}):`, err.message);
});

console.log(`[ai-worker] listening on queue "${AI_QUEUE_NAME}"`);
