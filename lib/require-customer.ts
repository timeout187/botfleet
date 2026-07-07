import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Session } from "next-auth";
import type { Bot } from "@/app/generated/prisma/client";

type CustomerGuardResult = { ok: true; session: Session } | { ok: false; response: NextResponse };

/** Any signed-in user may call customer-scoped routes; ownership is checked per-resource. */
export async function requireCustomerSession(): Promise<CustomerGuardResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, session };
}

/**
 * Loads a bot only if it belongs to a customer owned by userId - this is
 * the entire "customer cannot access other bots" guarantee. Returns null if
 * the bot doesn't exist OR isn't owned by this user (deliberately the same
 * response for both, so ownership can't be probed for by ID).
 */
export async function loadOwnedBot(botId: string, userId: string): Promise<Bot | null> {
  const bot = await db.bot.findUnique({ where: { id: botId }, include: { customer: true } });
  if (!bot || bot.customer.ownerUserId !== userId) return null;
  return bot;
}
