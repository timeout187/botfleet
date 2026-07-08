import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { clearReconciliationFailure } from "@/lib/reconciliation";
import { writeAuditLog } from "@/lib/audit";

/**
 * The manual escape hatch for a workload reconciliation gave up on after
 * MAX_RECONCILE_ATTEMPTS consecutive failures (see lib/agent-gateway/
 * server.ts's markCommandOutcome and docs/reconciliation.md's "Bounded
 * retry"). An admin fixes whatever was actually broken, then calls this
 * to let the next reconciliation tick try again - never automatic.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  await clearReconciliationFailure(id);
  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "workload.clear_reconciliation_failure",
    targetType: "workload",
    targetId: id,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
