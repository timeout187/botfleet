import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const agents = await db.agent.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ agents });
}
