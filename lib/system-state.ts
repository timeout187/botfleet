import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const SINGLETON_ID = "singleton";

export async function isMaintenanceModeEnabled(): Promise<boolean> {
  const state = await db.systemState.findUnique({ where: { id: SINGLETON_ID } });
  return state?.maintenanceMode ?? false;
}

export async function setMaintenanceMode(enabled: boolean, actorUserId: string): Promise<void> {
  await db.systemState.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, maintenanceMode: enabled },
    update: { maintenanceMode: enabled },
  });
  await writeAuditLog({
    actorUserId,
    action: enabled ? "system.maintenance_mode_enabled" : "system.maintenance_mode_disabled",
    targetType: "system_state",
    targetId: SINGLETON_ID,
  });
}
