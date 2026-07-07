import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { WorkerMode } from "@/app/generated/prisma/client";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const workers = await db.worker.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bots: true } } },
  });
  return NextResponse.json({ workers });
}

const createWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  mode: z.nativeEnum(WorkerMode).default(WorkerMode.pm2),
  host: z.string().optional(),
  maxBots: z.number().int().positive().max(50).default(5),
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createWorkerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const worker = await db.worker.create({ data: parsed.data });
  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "worker.create",
    targetType: "worker",
    targetId: worker.id,
    metadata: { name: worker.name, mode: worker.mode },
  });

  return NextResponse.json({ worker }, { status: 201 });
}
