import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { Role } from "@/app/generated/prisma/client";

const patchUserSchema = z.object({ role: z.nativeEnum(Role) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const parsed = patchUserSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Never allow the last owner to be demoted - that would lock everyone out
  // of role management until someone edits the database directly.
  if (target.role === Role.owner && parsed.data.role !== Role.owner) {
    const ownerCount = await db.user.count({ where: { role: Role.owner } });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last remaining owner" },
        { status: 422 },
      );
    }
  }

  const updated = await db.user.update({ where: { id }, data: { role: parsed.data.role } });

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "user.role_change",
    targetType: "user",
    targetId: id,
    metadata: { newRole: parsed.data.role },
  });

  return NextResponse.json({ user: { id: updated.id, role: updated.role } });
}
