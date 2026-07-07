import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { computeRebalanceRecommendations } from "@/lib/rebalance";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const [workers, bots] = await Promise.all([
    db.worker.findMany({ select: { id: true, name: true, maxBots: true, currentBots: true } }),
    db.bot.findMany({ select: { id: true, name: true, workerGroupId: true } }),
  ]);

  const recommendations = computeRebalanceRecommendations(workers, bots);
  return NextResponse.json({ recommendations });
}
