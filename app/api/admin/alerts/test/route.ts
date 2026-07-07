import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { sendDiscordAlert } from "@/lib/alerts/discord-webhook";
import { writeAuditLog } from "@/lib/audit";

const testAlertSchema = z.object({ webhookId: z.string().min(1) });

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = testAlertSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const webhook = await db.webhookDestination.findUnique({ where: { id: parsed.data.webhookId } });
  if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

  const result = await sendDiscordAlert(webhook.urlEncrypted, {
    title: "BotFleet test alert",
    message: "This is a test alert from BotFleet's Security & Alerts settings. Mass mentions are always disabled.",
    severity: "info",
  });

  await db.webhookDestination.update({
    where: { id: webhook.id },
    data: result.ok ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "alert.test",
    targetType: "webhook_destination",
    targetId: webhook.id,
    metadata: { ok: result.ok, status: result.status },
  });

  return NextResponse.json({ ok: result.ok, status: result.status });
}
