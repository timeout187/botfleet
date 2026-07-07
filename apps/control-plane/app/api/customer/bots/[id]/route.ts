import { NextResponse } from "next/server";
import { requireCustomerSession, loadOwnedBot } from "@/lib/require-customer";
import { db } from "@/lib/db";
import { serializeBotForCustomer } from "@/lib/serialize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomerSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const bot = await loadOwnedBot(id, guard.session.user.id);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const health = await db.botHealth.findUnique({ where: { botId: bot.id } });
  return NextResponse.json({ bot: serializeBotForCustomer(bot, health) });
}
