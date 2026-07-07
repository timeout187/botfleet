/**
 * Standalone background-task worker process for BotFleet. Run separately
 * from the Next.js web process (`npm run worker:ai`) so slow or scheduled
 * work never blocks a dashboard request. Hosts two BullMQ Workers in one
 * process: the AI task queue (crash explanation) and the scheduled-task
 * queue (recurring alert rule evaluation) - both are "background work",
 * so one process is enough; split them into separate processes later if
 * either needs independent scaling.
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";
import { AI_QUEUE_NAME, type ExplainCrashJobData } from "@/lib/queue/ai-queue";
import { analyzeCrash, type CrashAnalysis } from "@/lib/queue/crash-analysis";
import {
  SCHEDULER_QUEUE_NAME,
  EVALUATE_ALERTS_JOB_NAME,
  ensureAlertEvaluationScheduled,
} from "@/lib/queue/scheduler-queue";
import { evaluateAlertRules, type EvaluateAlertRulesResult } from "@/lib/alerts/evaluate-rules";
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

const aiWorker = new Worker<ExplainCrashJobData, CrashAnalysis>(
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

aiWorker.on("completed", (job) => {
  console.log(`[ai-worker] completed ${job.id} (${job.name})`);
});
aiWorker.on("failed", (job, err) => {
  console.error(`[ai-worker] failed ${job?.id} (${job?.name}):`, err.message);
});

const schedulerWorker = new Worker<Record<string, never>, EvaluateAlertRulesResult>(
  SCHEDULER_QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case EVALUATE_ALERTS_JOB_NAME:
        // actorUserId is null here - this run wasn't triggered by a human,
        // and the audit log entry (action "alerts.evaluate") reflects that.
        return evaluateAlertRules(null);
      default:
        throw new Error(`Unknown scheduled job type: ${job.name}`);
    }
  },
  { connection: getQueueConnection(), concurrency: 1 },
);

schedulerWorker.on("completed", (job) => {
  console.log(
    `[scheduler-worker] completed ${job.id} (${job.name}): ${JSON.stringify(job.returnvalue)}`,
  );
});
schedulerWorker.on("failed", (job, err) => {
  console.error(`[scheduler-worker] failed ${job?.id} (${job?.name}):`, err.message);
});

void (async () => {
  await ensureAlertEvaluationScheduled();
  console.log(`[ai-worker] listening on queue "${AI_QUEUE_NAME}"`);
  console.log(
    `[scheduler-worker] listening on queue "${SCHEDULER_QUEUE_NAME}" (alert evaluation every 5 minutes)`,
  );
})();
