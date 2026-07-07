import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";

const rotateTokenSchema = z.object({ token: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await db.bot.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const parsed = rotateTokenSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  await db.bot.update({
    where: { id },
    data: { tokenEncrypted: encryptSecret(parsed.data.token) },
  });

  // Audited without the token itself, and without ever logging it.
  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "bot.rotate_token",
    targetType: "bot",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
