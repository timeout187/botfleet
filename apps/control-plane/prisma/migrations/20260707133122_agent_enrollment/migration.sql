-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('enrolling', 'online', 'degraded', 'disconnected', 'draining', 'maintenance', 'disabled');

-- CreateEnum
CREATE TYPE "AgentCredentialStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'enrolling',
    "protocol_version" INTEGER NOT NULL,
    "agent_version" TEXT NOT NULL,
    "environment" TEXT,
    "region" TEXT,
    "labels_json" JSONB NOT NULL,
    "capabilities_json" JSONB NOT NULL,
    "hostname" TEXT NOT NULL,
    "architecture" TEXT NOT NULL,
    "operating_system" TEXT NOT NULL,
    "total_memory_mb" INTEGER,
    "available_memory_mb" INTEGER,
    "cpu_usage_percent" DOUBLE PRECISION,
    "disk_total_mb" INTEGER,
    "disk_available_mb" INTEGER,
    "last_heartbeat_at" TIMESTAMP(3),
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_credentials" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "AgentCredentialStatus" NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "agent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "restrictions_json" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by_agent_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_credentials_fingerprint_key" ON "agent_credentials"("fingerprint");

-- CreateIndex
CREATE INDEX "agent_credentials_agent_id_idx" ON "agent_credentials"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_token_hash_key" ON "enrollment_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
