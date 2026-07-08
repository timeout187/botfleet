-- AlterTable
ALTER TABLE "agent_commands" ADD COLUMN     "generation" INTEGER;

-- AlterTable
ALTER TABLE "workloads" ADD COLUMN     "next_reconcile_attempt_at" TIMESTAMP(3),
ADD COLUMN     "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reconciliation_suspended_at" TIMESTAMP(3);
