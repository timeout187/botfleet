import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";

const ALERT_EVENT_TYPES = [
  "bot.offline",
  "bot.start_failed",
  "worker.crashed",
  "shard.disconnected",
  "token.invalid",
  "rate_limit.warning",
  "guild_limit.reached",
  "customer.expired",
  "memory.high",
  "restart_count.high",
  "database.error",
  "queue.error",
] as const;

export { ALERT_EVENT_TYPES };

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const webhooks = await db.webhookDestination.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    webhooks: webhooks.map((w) => ({
      id: w.id,
      name: w.name,
      enabled: w.enabled,
      events: w.eventsJson,
      lastSuccessAt: w.lastSuccessAt,
      lastFailureAt: w.lastFailureAt,
      createdAt: w.createdAt,
    })),
  });
}

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum(ALERT_EVENT_TYPES)).default([...ALERT_EVENT_TYPES]),
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createWebhookSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const webhook = await db.webhookDestination.create({
    data: {
      name: parsed.data.name,
      urlEncrypted: encryptSecret(parsed.data.url),
      eventsJson: parsed.data.events,
    },
  });

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "webhook.create",
    targetType: "webhook_destination",
    targetId: webhook.id,
    metadata: { name: webhook.name },
  });

  return NextResponse.json({ id: webhook.id, name: webhook.name }, { status: 201 });
}
