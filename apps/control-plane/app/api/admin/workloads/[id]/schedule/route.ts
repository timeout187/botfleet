import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { computeSchedulingRecommendation } from "@/lib/scheduling";

/**
 * Dry-run only - computes and records a placement recommendation but
 * never assigns anything. Automatic scheduling is disabled by design
 * (see docs/scheduler.md); an admin applies a recommendation explicitly
 * via POST /api/admin/workloads/:id/assign.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await computeSchedulingRecommendation(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }

  return NextResponse.json({ decision: result.decision });
}
