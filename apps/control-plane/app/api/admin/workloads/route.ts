import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { createWorkload } from "@/lib/workloads";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const workloads = await db.workload.findMany({
    orderBy: { createdAt: "desc" },
    include: { bot: { select: { name: true } }, assignedAgent: { select: { name: true } } },
  });
  return NextResponse.json({ workloads });
}

const createWorkloadSchema = z.object({
  botId: z.string().min(1),
  specification: z.unknown(),
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createWorkloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await createWorkload(
    parsed.data.botId,
    parsed.data.specification,
    guard.session.user.id,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: "Invalid workload specification", issues: result.issues },
      { status: 400 },
    );
  }

  return NextResponse.json({ workloadId: result.workloadId }, { status: 201 });
}
