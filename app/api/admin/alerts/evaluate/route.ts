import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { ensureBuiltinPluginsRegistered, getAllAlertRules } from "@/lib/plugins";
import { writeAuditLog } from "@/lib/audit";
import { AlertStatus } from "@/app/generated/prisma/client";

/**
 * Runs every registered alert rule (built-in and plugin-contributed)
 * against current fleet state. Idempotent-ish: skips creating a new Alert
 * row if an open alert with the same title already exists, so repeated
 * calls (e.g. a future cron) don't spam duplicates.
 */
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  ensureBuiltinPluginsRegistered();
  const rules = getAllAlertRules();

  const created: string[] = [];
  for (const rule of rules) {
    const result = await rule.evaluate();
    if (!result.trigger || !result.title) continue;

    const existing = await db.alert.findFirst({
      where: { title: result.title, status: AlertStatus.open },
    });
    if (existing) continue;

    await db.alert.create({
      data: {
        eventType: rule.id,
        severity: result.severity ?? "warning",
        title: result.title,
        message: result.message ?? "",
        status: AlertStatus.open,
      },
    });
    created.push(result.title);
  }

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "alerts.evaluate",
    targetType: "alert",
    targetId: "batch",
    metadata: { rulesEvaluated: rules.length, alertsCreated: created.length },
  });

  return NextResponse.json({ rulesEvaluated: rules.length, alertsCreated: created });
}
