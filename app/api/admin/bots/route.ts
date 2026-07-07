import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";
import { serializeBot } from "@/lib/serialize";
import {
  assertBotCountWithinPlan,
  assertGuildLimitWithinPlan,
  assertShardCountWithinPlan,
  PlanLimitError,
} from "@/lib/plans";
import { PlanTier } from "@/app/generated/prisma/client";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const bots = await db.bot.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ bots: bots.map(serializeBot) });
}

const createBotSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1).max(100),
  clientId: z.string().min(1),
  token: z.string().min(1),
  publicKey: z.string().optional(),
  plan: z.nativeEnum(PlanTier).default(PlanTier.free),
  guildLimit: z.number().int().positive().default(100),
  shardCount: z.number().int().positive().default(1),
  workerGroupId: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createBotSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  try {
    const existingBotCount = await db.bot.count({ where: { customerId: input.customerId } });
    assertBotCountWithinPlan(input.plan, existingBotCount);
    assertGuildLimitWithinPlan(input.plan, input.guildLimit);
    assertShardCountWithinPlan(input.plan, input.shardCount);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const bot = await db.bot.create({
    data: {
      customerId: input.customerId,
      name: input.name,
      clientId: input.clientId,
      tokenEncrypted: encryptSecret(input.token),
      publicKey: input.publicKey,
      plan: input.plan,
      guildLimit: input.guildLimit,
      shardCount: input.shardCount,
      workerGroupId: input.workerGroupId,
    },
  });
  await db.botHealth.create({ data: { botId: bot.id } });

  await writeAuditLog({
    actorUserId: guard.session.user.id,
    action: "bot.create",
    targetType: "bot",
    targetId: bot.id,
    metadata: { name: bot.name, customerId: bot.customerId },
  });

  return NextResponse.json({ bot: serializeBot(bot) }, { status: 201 });
}
