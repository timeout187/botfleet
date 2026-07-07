import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { serializeBot } from "@/lib/serialize";
import { assertGuildLimitWithinPlan, assertShardCountWithinPlan, PlanLimitError } from "@/lib/plans";
import { BotStatus, PlanTier } from "@/app/generated/prisma/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const bot = await db.bot.findUnique({
    where: { id },
    include: { health: true, shards: true, workerGroup: true },
  });
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  return NextResponse.json({
    bot: serializeBot(bot),
    health: bot.health,
    shards: bot.shards,
    worker: bot.workerGroup ? { id: bot.workerGroup.id, name: bot.workerGroup.name } : null,
  });
}

const patchBotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.nativeEnum(PlanTier).optional(),
  guildLimit: z.number().int().positive().optional(),
  shardCount: z.number().int().positive().optional(),
  workerGroupId: z.string().nullable().optional(),
  status: z.nativeEnum(BotStatus).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await db.bot.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const parsed = patchBotSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const plan = input.plan ?? existing.plan;

  try {
    if (input.guildLimit !== undefined) assertGuildLimitWithinPlan(plan, input.guildLimit);
    if (input.shardCount !== undefined) assertShardCountWithinPlan(plan, input.shardCount);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const bot = await db.bot.update({ where: { id }, data: input });

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "bot.update",
    targetType: "bot",
    targetId: bot.id,
    metadata: input,
  });

  return NextResponse.json({ bot: serializeBot(bot) });
}
