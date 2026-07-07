/**
 * Standalone background-task worker process for BotFleet. Run separately
 * from the Next.js web process (`npm run worker:ai`) so slow or scheduled
 * work never blocks a dashboard request. Hosts three BullMQ Workers in one
 * process: the AI task queue (crash explanation), the scheduled-task queue
 * (recurring alert rule evaluation), and the deployment restart queue
 * (staggered bot restarts) - all "background work", so one process is
 * enough; split them into separate processes later if any needs
 * independent scaling.
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
  RECONCILE_WORKLOADS_JOB_NAME,
  ensureReconciliationScheduled,
} from "@/lib/queue/scheduler-queue";
import {
  RESTART_QUEUE_NAME,
  STAGGERED_RESTART_JOB_NAME,
  type StaggeredRestartJobData,
} from "@/lib/queue/restart-queue";
import { evaluateAlertRules, type EvaluateAlertRulesResult } from "@/lib/alerts/evaluate-rules";
import { reconcileWorkloads, type ReconciliationResult } from "@/lib/reconciliation";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { isMaintenanceModeEnabled } from "@/lib/system-state";
import { performBotAction } from "@/lib/bot-actions";
import { BotStatus, WorkerStatus } from "@/app/generated/prisma/client";

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

const schedulerWorker = new Worker<
  Record<string, never>,
  EvaluateAlertRulesResult | ReconciliationResult
>(
  SCHEDULER_QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case EVALUATE_ALERTS_JOB_NAME:
        // actorUserId is null here - this run wasn't triggered by a human,
        // and the audit log entry (action "alerts.evaluate") reflects that.
        return evaluateAlertRules(null);
      case RECONCILE_WORKLOADS_JOB_NAME:
        // Same reasoning: a self-healing pass, not a human action - any
        // corrective bot.start/bot.stop it issues is audited with a null actor.
        return reconcileWorkloads(null);
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

interface StaggeredRestartResult {
  skipped: boolean;
  reason?: string;
}

async function processStaggeredRestart(
  job: Job<StaggeredRestartJobData>,
): Promise<StaggeredRestartResult> {
  // Re-check live state right before restarting, not just at enqueue time -
  // a large fleet can take minutes to stagger through, and maintenance mode
  // or a worker drain may start partway through.
  if (await isMaintenanceModeEnabled()) {
    return { skipped: true, reason: "maintenance mode is enabled" };
  }

  const bot = await db.bot.findUnique({
    where: { id: job.data.botId },
    include: { workerGroup: true },
  });
  if (!bot) {
    return { skipped: true, reason: "bot no longer exists" };
  }
  if (bot.status !== BotStatus.online) {
    return { skipped: true, reason: `bot status is "${bot.status}", not online` };
  }
  if (bot.workerGroup && bot.workerGroup.status !== WorkerStatus.online) {
    return { skipped: true, reason: `worker status is "${bot.workerGroup.status}"` };
  }

  await performBotAction(bot.id, "restart", job.data.actorUserId);
  await writeAuditLog({
    actorUserId: job.data.actorUserId,
    action: "deployment.staggered_restart",
    targetType: "bot",
    targetId: bot.id,
    metadata: { deploymentId: job.data.deploymentId },
  });
  return { skipped: false };
}

const restartWorker = new Worker<StaggeredRestartJobData, StaggeredRestartResult>(
  RESTART_QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case STAGGERED_RESTART_JOB_NAME:
        return processStaggeredRestart(job);
      default:
        throw new Error(`Unknown restart job type: ${job.name}`);
    }
  },
  { connection: getQueueConnection(), concurrency: 3 },
);

restartWorker.on("completed", (job) => {
  console.log(
    `[restart-worker] completed ${job.id} (bot ${job.data.botId}): ${JSON.stringify(job.returnvalue)}`,
  );
});
restartWorker.on("failed", (job, err) => {
  console.error(`[restart-worker] failed ${job?.id} (bot ${job?.data.botId}):`, err.message);
});

void (async () => {
  await ensureAlertEvaluationScheduled();
  await ensureReconciliationScheduled();
  console.log(`[ai-worker] listening on queue "${AI_QUEUE_NAME}"`);
  console.log(
    `[scheduler-worker] listening on queue "${SCHEDULER_QUEUE_NAME}" (alert evaluation every 5 minutes, reconciliation every 30s)`,
  );
  console.log(`[restart-worker] listening on queue "${RESTART_QUEUE_NAME}"`);
})();
