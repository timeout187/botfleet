import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";

/**
 * BotFleet doesn't ship a bundled log shipper in this pass (see docs/roadmap
 * for the plugin-based log source design). Today this surfaces audit log
 * entries - the one log stream that's fully real right now - filterable by
 * target type/id and a from/to time range. Bot/worker process logs will be
 * layered on top of the same shape once a worker runtime exists to emit them.
 */
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType") ?? undefined;
  const targetId = url.searchParams.get("targetId") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const logs = await db.auditLog.findMany({
    where: {
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true, discordUserId: true } } },
  });

  return NextResponse.json({ logs });
}
