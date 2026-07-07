import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { PlanTier } from "@/app/generated/prisma/client";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const customers = await db.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bots: true } } },
  });
  return NextResponse.json({ customers });
}

const createCustomerSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.nativeEnum(PlanTier).default(PlanTier.free),
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createCustomerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await db.customer.create({
    data: {
      name: parsed.data.name,
      plan: parsed.data.plan,
      ownerUserId: guard.session.user.id,
    },
  });

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "customer.create",
    targetType: "customer",
    targetId: customer.id,
    metadata: { name: customer.name, plan: customer.plan },
  });

  return NextResponse.json({ customer }, { status: 201 });
}
