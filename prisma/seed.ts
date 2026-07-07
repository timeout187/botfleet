/**
 * Mock data only - never seeded from real production data. Bot tokens here
 * are placeholder strings encrypted the same way a real token would be, so
 * the vault/masking code path is exercised honestly even with fake input.
 */
import {
  PrismaClient,
  Role,
  PlanTier,
  BotStatus,
  WorkerMode,
  WorkerStatus,
  ShardStatus,
  AlertSeverity,
  AlertStatus,
  DeploymentStatus,
  AssignmentStatus,
} from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptSecret } from "../lib/crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const seedUser = await db.user.upsert({
    where: { email: "seed-owner@example.invalid" },
    update: {},
    create: {
      email: "seed-owner@example.invalid",
      name: "Seed Owner",
      role: Role.owner,
      discordUserId: "000000000000000001",
    },
  });

  const customerDefs = [
    { name: "Nova Community", plan: PlanTier.pro },
    { name: "Aegis Moderation Co.", plan: PlanTier.starter },
    { name: "Solo Dev - Kess", plan: PlanTier.free },
  ];

  const customers = [];
  for (const def of customerDefs) {
    const customer = await db.customer.create({
      data: { name: def.name, plan: def.plan, ownerUserId: seedUser.id },
    });
    customers.push(customer);
  }

  const worker1 = await db.worker.create({
    data: {
      name: "worker-1",
      mode: WorkerMode.pm2,
      status: WorkerStatus.online,
      host: "worker-1.internal",
      maxBots: 5,
      currentBots: 2,
      memoryMb: 340,
      cpuPercent: 12.5,
      lastHeartbeatAt: new Date(),
    },
  });
  const worker2 = await db.worker.create({
    data: {
      name: "worker-2",
      mode: WorkerMode.docker,
      status: WorkerStatus.online,
      host: "worker-2.internal",
      maxBots: 5,
      currentBots: 1,
      memoryMb: 210,
      cpuPercent: 6.2,
      lastHeartbeatAt: new Date(),
    },
  });

  const botDefs = [
    {
      customer: customers[0],
      name: "Nova Guardian",
      plan: PlanTier.pro,
      status: BotStatus.online,
      guildCount: 1840,
      shardCount: 2,
      worker: worker1,
    },
    {
      customer: customers[0],
      name: "Nova Support Bot",
      plan: PlanTier.pro,
      status: BotStatus.online,
      guildCount: 412,
      shardCount: 1,
      worker: worker1,
    },
    {
      customer: customers[1],
      name: "Aegis Sentinel",
      plan: PlanTier.starter,
      status: BotStatus.failed,
      guildCount: 88,
      shardCount: 1,
      worker: worker2,
    },
    {
      customer: customers[2],
      name: "Kess's Helper",
      plan: PlanTier.free,
      status: BotStatus.offline,
      guildCount: 12,
      shardCount: 1,
      worker: null,
    },
  ];

  for (const def of botDefs) {
    const bot = await db.bot.create({
      data: {
        customerId: def.customer.id,
        name: def.name,
        clientId: `1${String(Math.floor(Math.random() * 1e17)).padStart(17, "0")}`,
        tokenEncrypted: encryptSecret(`mock-token-${crypto.randomUUID()}`),
        plan: def.plan,
        status: def.status,
        guildLimit: def.plan === PlanTier.free ? 50 : def.plan === PlanTier.starter ? 250 : 2500,
        shardCount: def.shardCount,
        workerGroupId: def.worker?.id,
        lastReadyAt: def.status === BotStatus.online ? new Date() : null,
        lastHeartbeatAt: def.status === BotStatus.online ? new Date() : null,
      },
    });

    await db.botHealth.create({
      data: {
        botId: bot.id,
        status: def.status,
        guildCount: def.guildCount,
        shardCount: def.shardCount,
        pingMs: def.status === BotStatus.online ? 40 + Math.floor(Math.random() * 60) : null,
        memoryMb: def.status === BotStatus.online ? 80 + Math.floor(Math.random() * 120) : null,
        restartCount: def.status === BotStatus.failed ? 4 : Math.floor(Math.random() * 2),
        lastErrorSafe:
          def.status === BotStatus.failed
            ? "Discord gateway closed with code 4004 (invalid token)"
            : null,
      },
    });

    if (def.worker) {
      await db.workerAssignment.create({
        data: { workerId: def.worker.id, botId: bot.id, status: AssignmentStatus.active },
      });
    }

    for (let i = 0; i < def.shardCount; i++) {
      await db.shard.create({
        data: {
          botId: bot.id,
          shardId: i,
          status:
            def.status === BotStatus.online ? ShardStatus.connected : ShardStatus.disconnected,
          guildCount: Math.floor(def.guildCount / def.shardCount),
          pingMs: def.status === BotStatus.online ? 40 + Math.floor(Math.random() * 60) : null,
          reconnectCount: def.status === BotStatus.failed ? 3 : 0,
          lastHeartbeatAt: def.status === BotStatus.online ? new Date() : null,
        },
      });
    }

    await db.auditLog.create({
      data: {
        actorUserId: seedUser.id,
        action: "bot.create",
        targetType: "bot",
        targetId: bot.id,
        metadataJson: { name: bot.name, seed: true },
      },
    });
  }

  await db.alert.createMany({
    data: [
      {
        eventType: "bot.start_failed",
        severity: AlertSeverity.critical,
        title: "Aegis Sentinel failed to start",
        message: "Discord gateway closed with code 4004 (invalid token). Token rotation required.",
        status: AlertStatus.open,
      },
      {
        eventType: "guild_limit.reached",
        severity: AlertSeverity.warning,
        title: "Nova Guardian approaching guild limit",
        message: "1840 / 2500 guilds on the Pro plan.",
        status: AlertStatus.open,
      },
      {
        eventType: "worker.crashed",
        severity: AlertSeverity.info,
        title: "worker-2 restarted",
        message: "Routine restart completed successfully.",
        status: AlertStatus.resolved,
      },
    ],
  });

  await db.deployment.create({
    data: {
      version: "0.1.0",
      commitSha: "0000000000000000000000000000000000000000",
      status: DeploymentStatus.success,
      deployedById: seedUser.id,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 58 * 60 * 1000),
      notes: "Initial seed deployment record.",
    },
  });

  console.log(
    `Seeded ${customers.length} customers, ${botDefs.length} bots, 2 workers, alerts, and a deployment.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
