import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { performBotAction, BotNotFoundError } from "@/lib/bot-actions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    await performBotAction(id, "stop", guard.session.user.id);
  } catch (err) {
    if (err instanceof BotNotFoundError) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
