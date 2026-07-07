import { db } from "@/lib/db";
import { ensureBuiltinPluginsRegistered, getAllAlertRules } from "@/lib/plugins";
import { writeAuditLog } from "@/lib/audit";
import { AlertStatus } from "@/app/generated/prisma/client";

export interface EvaluateAlertRulesResult {
  rulesEvaluated: number;
  alertsCreated: string[];
}

/**
 * Runs every registered alert rule (built-in and plugin-contributed)
 * against current fleet state. Idempotent: skips creating a new Alert row
 * if an open alert with the same title already exists, so repeated calls
 * (a manual click, or the scheduled job processed in lib/queue/ai-worker.ts)
 * never spam duplicates. actorUserId is null for the scheduled job (no
 * human triggered it) and the signed-in admin's id for the manual button.
 */
export async function evaluateAlertRules(
  actorUserId: string | null,
): Promise<EvaluateAlertRulesResult> {
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
    actorUserId,
    action: "alerts.evaluate",
    targetType: "alert",
    targetId: "batch",
    metadata: { rulesEvaluated: rules.length, alertsCreated: created.length },
  });

  return { rulesEvaluated: rules.length, alertsCreated: created };
}
