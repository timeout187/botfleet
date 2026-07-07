import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { generateRandomToken, hashToken } from "@/lib/agents/token-hash";
import type { Prisma } from "@/app/generated/prisma/client";

export interface EnrollmentRestrictions {
  environment?: string;
  requiredLabels?: Record<string, string>;
}

/** Short-lived by design: single-use tokens that sit around for days are a
 * bigger risk than the inconvenience of regenerating one. */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export async function createEnrollmentToken(
  actorUserId: string,
  restrictions?: EnrollmentRestrictions,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<{ id: string; plaintextToken: string; expiresAt: Date }> {
  const plaintextToken = generateRandomToken();
  const tokenHash = hashToken(plaintextToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  const row = await db.enrollmentToken.create({
    data: {
      tokenHash,
      restrictionsJson: (restrictions as Prisma.InputJsonValue | undefined) ?? undefined,
      expiresAt,
      createdById: actorUserId,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "agent.enrollment_token_created",
    targetType: "enrollment_token",
    targetId: row.id,
    metadata: { expiresAt: expiresAt.toISOString(), restrictions: restrictions ?? null },
  });

  // Returned exactly once - only the hash is ever persisted.
  return { id: row.id, plaintextToken, expiresAt };
}

export type ConsumeEnrollmentTokenResult =
  | { ok: true; tokenId: string; restrictions: EnrollmentRestrictions | null }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

/**
 * Atomically claims a token for `agentId` via a single conditional UPDATE
 * (`WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > now()`) rather
 * than a read-then-write pair, so two connections racing to redeem the
 * same token can't both succeed - single-use is enforced by the database,
 * not by application-level timing.
 */
export async function consumeEnrollmentToken(
  plaintextToken: string,
  agentId: string,
): Promise<ConsumeEnrollmentTokenResult> {
  const tokenHash = hashToken(plaintextToken);
  const now = new Date();

  const claim = await db.enrollmentToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, usedByAgentId: agentId },
  });

  if (claim.count === 0) {
    const row = await db.enrollmentToken.findUnique({ where: { tokenHash } });
    if (!row) return { ok: false, reason: "not_found" };
    if (row.usedAt) return { ok: false, reason: "already_used" };
    return { ok: false, reason: "expired" };
  }

  const row = await db.enrollmentToken.findUniqueOrThrow({ where: { tokenHash } });

  await writeAuditLog({
    actorUserId: row.createdById,
    action: "agent.enrollment_token_consumed",
    targetType: "enrollment_token",
    targetId: row.id,
    metadata: { agentId },
  });

  return {
    ok: true,
    tokenId: row.id,
    restrictions: (row.restrictionsJson as EnrollmentRestrictions | null) ?? null,
  };
}

/**
 * Checks whether an enrolling agent's declared environment/labels satisfy
 * the token's restrictions (e.g. a token scoped to `environment: "production"`
 * must reject an agent that declares `environment: "staging"`). A token
 * with no restrictions accepts anything - restrictions narrow, they don't
 * widen. Pure function, no I/O, so it's cheaply unit-testable in
 * isolation from the database.
 */
export function restrictionsSatisfied(
  restrictions: EnrollmentRestrictions | null,
  agentLabels: Record<string, string | undefined>,
): boolean {
  if (!restrictions) return true;

  if (restrictions.environment && agentLabels.environment !== restrictions.environment) {
    return false;
  }

  if (restrictions.requiredLabels) {
    for (const [key, value] of Object.entries(restrictions.requiredLabels)) {
      if (agentLabels[key] !== value) return false;
    }
  }

  return true;
}
