import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { evaluateAlertRules } from "@/lib/alerts/evaluate-rules";

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const result = await evaluateAlertRules(guard.session.user.id);
  return NextResponse.json(result);
}
