import { db } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";

export async function writeAuditLog(entry: {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadataJson: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
