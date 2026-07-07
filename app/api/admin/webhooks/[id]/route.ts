import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  await db.webhookDestination.delete({ where: { id } }).catch(() => null);

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "webhook.delete",
    targetType: "webhook_destination",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
