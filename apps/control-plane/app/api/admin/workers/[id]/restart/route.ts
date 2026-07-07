import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { WorkerStatus } from "@/app/generated/prisma/client";

/**
 * TODO(real-runner): a real worker restart would signal the actual worker
 * process (e.g. `pm2 restart botfleet-worker-<id>`) to gracefully drain its
 * assigned bots and re-connect. This records the intent and status
 * transition so the rest of the product can be built/tested against it.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const worker = await db.worker.findUnique({ where: { id } });
  if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });

  await db.worker.update({ where: { id }, data: { status: WorkerStatus.online } });
  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "worker.restart",
    targetType: "worker",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
