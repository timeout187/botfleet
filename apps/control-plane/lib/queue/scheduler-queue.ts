import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";

export const SCHEDULER_QUEUE_NAME = "botfleet-scheduled-tasks";
export const EVALUATE_ALERTS_JOB_NAME = "evaluate-alerts";
const EVALUATE_ALERTS_INTERVAL_MS = 5 * 60 * 1000;
export const RECONCILE_WORKLOADS_JOB_NAME = "reconcile-workloads";
const RECONCILE_WORKLOADS_INTERVAL_MS = 30 * 1000;

function createQueue() {
  return new Queue(SCHEDULER_QUEUE_NAME, { connection: getQueueConnection() });
}

let queue: ReturnType<typeof createQueue> | undefined;

function getQueue() {
  if (!queue) {
    queue = createQueue();
  }
  return queue;
}

/**
 * Registers the recurring alert-evaluation job. BullMQ dedupes repeatable
 * jobs by their repeat key (queue + job name + repeat options), so calling
 * this on every worker process startup is safe - it won't create a second
 * schedule.
 */
export async function ensureAlertEvaluationScheduled(): Promise<void> {
  await getQueue().add(
    EVALUATE_ALERTS_JOB_NAME,
    {},
    { repeat: { every: EVALUATE_ALERTS_INTERVAL_MS }, jobId: EVALUATE_ALERTS_JOB_NAME },
  );
}

/**
 * Registers the recurring reconciliation job (docs/reconciliation.md). A
 * short interval (30s) is safe because `reconcileWorkloads()` is a cheap,
 * idempotent read-mostly pass - it only issues a command when desired and
 * observed state actually disagree, and skips anything with a command
 * already in flight.
 */
export async function ensureReconciliationScheduled(): Promise<void> {
  await getQueue().add(
    RECONCILE_WORKLOADS_JOB_NAME,
    {},
    { repeat: { every: RECONCILE_WORKLOADS_INTERVAL_MS }, jobId: RECONCILE_WORKLOADS_JOB_NAME },
  );
}
