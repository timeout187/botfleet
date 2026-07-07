import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runSecurityChecks } from "@/lib/security-checks";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const report = await runSecurityChecks();
  return NextResponse.json(report);
}
