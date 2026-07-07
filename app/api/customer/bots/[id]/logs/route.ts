import { NextResponse } from "next/server";
import { requireCustomerSession, loadOwnedBot } from "@/lib/require-customer";
import { db } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomerSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const bot = await loadOwnedBot(id, guard.session.user.id);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const logs = await db.auditLog.findMany({
    where: { targetType: "bot", targetId: bot.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { action: true, createdAt: true },
  });

  return NextResponse.json({ logs });
}
