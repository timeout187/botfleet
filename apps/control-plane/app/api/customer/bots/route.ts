import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/require-customer";
import { db } from "@/lib/db";
import { serializeBotForCustomer } from "@/lib/serialize";

export async function GET() {
  const guard = await requireCustomerSession();
  if (!guard.ok) return guard.response;

  const bots = await db.bot.findMany({
    where: { customer: { ownerUserId: guard.session.user.id } },
    include: { health: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ bots: bots.map((b) => serializeBotForCustomer(b, b.health)) });
}
