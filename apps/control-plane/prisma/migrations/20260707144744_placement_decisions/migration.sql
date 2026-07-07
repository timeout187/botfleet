-- CreateTable
CREATE TABLE "placement_decisions" (
    "id" TEXT NOT NULL,
    "workload_id" TEXT NOT NULL,
    "selected_agent_id" TEXT,
    "candidate_summary_json" JSONB NOT NULL,
    "reason_json" JSONB NOT NULL,
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "placement_decisions_workload_id_idx" ON "placement_decisions"("workload_id");
