import { NextResponse } from "next/server";
import { requireCustomerSession, loadOwnedBot } from "@/lib/require-customer";
import { getPlanLimits } from "@/lib/plans";
import { performBotAction } from "@/lib/bot-actions";
import { isMaintenanceModeEnabled } from "@/lib/system-state";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomerSession();
  if (!guard.ok) return guard.response;

  if (await isMaintenanceModeEnabled()) {
    return NextResponse.json(
      { error: "BotFleet is in maintenance mode - bot restarts are temporarily disabled." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const bot = await loadOwnedBot(id, guard.session.user.id);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  if (!getPlanLimits(bot.plan).restartControlsAllowed) {
    return NextResponse.json(
      { error: "Restart controls are not included in this bot's plan." },
      { status: 403 },
    );
  }

  await performBotAction(bot.id, "restart", guard.session.user.id);
  return NextResponse.json({ ok: true });
}
