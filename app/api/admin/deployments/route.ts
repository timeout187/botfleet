import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { ensureBuiltinPluginsRegistered, getPlugins } from "@/lib/plugins";
import { writeAuditLog } from "@/lib/audit";
import { DeploymentStatus, BotStatus } from "@/app/generated/prisma/client";
import { isMaintenanceModeEnabled } from "@/lib/system-state";
import { enqueueStaggeredRestarts } from "@/lib/queue/restart-queue";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const deployments = await db.deployment.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { deployedBy: { select: { name: true } } },
  });
  return NextResponse.json({ deployments });
}

const triggerDeploymentSchema = z.object({
  version: z.string().min(1).max(50),
  commitSha: z.string().min(1).max(64),
  notes: z.string().max(500).optional(),
});

/**
 * Actually runs the deployment lifecycle: creates a Deployment row, then
 * calls every registered plugin's beforeDeploy()/afterDeploy() hook (see
 * lib/plugins/builtin/runner-plugins.ts) - real, observable side effects
 * (each hook writes its own audit log entry). Once hooks succeed, every
 * currently-online bot gets a staggered restart job (lib/queue/restart-queue.ts)
 * so the deployment actually reaches running bots, 15s apart, without
 * blocking this request - unless maintenance mode is on, in which case
 * restarts are skipped entirely (the deployment itself still records as a
 * success; restarting bots during a maintenance window is the operator's
 * call, not automatic).
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = triggerDeploymentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const deployment = await db.deployment.create({
    data: {
      version: input.version,
      commitSha: input.commitSha,
      status: DeploymentStatus.in_progress,
      deployedById: guard.session.user.id,
      startedAt: new Date(),
      notes: input.notes,
    },
  });

  ensureBuiltinPluginsRegistered();
  const hookPlugins = getPlugins().filter((p) => p.deploymentHooks);

  try {
    for (const plugin of hookPlugins) {
      await plugin.deploymentHooks?.beforeDeploy?.();
    }
    for (const plugin of hookPlugins) {
      await plugin.deploymentHooks?.afterDeploy?.();
    }

    const finished = await db.deployment.update({
      where: { id: deployment.id },
      data: { status: DeploymentStatus.success, finishedAt: new Date() },
    });

    let restartsQueued = 0;
    const maintenanceMode = await isMaintenanceModeEnabled();
    if (!maintenanceMode) {
      const onlineBots = await db.bot.findMany({
        where: { status: BotStatus.online },
        select: { id: true },
      });
      restartsQueued = await enqueueStaggeredRestarts(
        onlineBots.map((b) => b.id),
        deployment.id,
        guard.session.user.id,
      );
    }

    await writeAuditLog({
      actorUserId: guard.session.user.id,
      action: "deployment.trigger",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: {
        version: input.version,
        hooksRun: hookPlugins.map((p) => p.id),
        restartsQueued,
        restartsSkippedForMaintenance: maintenanceMode,
      },
    });

    return NextResponse.json({ deployment: finished, restartsQueued }, { status: 201 });
  } catch (err) {
    const failed = await db.deployment.update({
      where: { id: deployment.id },
      data: { status: DeploymentStatus.failed, finishedAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: guard.session.user.id,
      action: "deployment.trigger_failed",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ deployment: failed }, { status: 500 });
  }
}
