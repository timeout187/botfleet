-- CreateEnum
CREATE TYPE "WorkloadDesiredState" AS ENUM ('running', 'stopped');

-- CreateEnum
CREATE TYPE "WorkloadObservedState" AS ENUM ('unknown', 'pending', 'starting', 'running', 'stopping', 'stopped', 'failed');

-- CreateEnum
CREATE TYPE "AgentCommandStatus" AS ENUM ('pending', 'accepted', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "workloads" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "specification_json" JSONB NOT NULL,
    "specification_version" TEXT NOT NULL,
    "desired_state" "WorkloadDesiredState" NOT NULL DEFAULT 'stopped',
    "observed_state" "WorkloadObservedState" NOT NULL DEFAULT 'unknown',
    "assigned_agent_id" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "observed_generation" INTEGER NOT NULL DEFAULT 0,
    "last_transition_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_commands" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "workload_id" TEXT,
    "command_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "AgentCommandStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "safe_error" TEXT,

    CONSTRAINT "agent_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workloads_bot_id_key" ON "workloads"("bot_id");

-- CreateIndex
CREATE INDEX "workloads_assigned_agent_id_idx" ON "workloads"("assigned_agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_commands_idempotency_key_key" ON "agent_commands"("idempotency_key");

-- CreateIndex
CREATE INDEX "agent_commands_agent_id_idx" ON "agent_commands"("agent_id");

-- CreateIndex
CREATE INDEX "agent_commands_workload_id_idx" ON "agent_commands"("workload_id");

-- AddForeignKey
ALTER TABLE "workloads" ADD CONSTRAINT "workloads_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workloads" ADD CONSTRAINT "workloads_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_workload_id_fkey" FOREIGN KEY ("workload_id") REFERENCES "workloads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
