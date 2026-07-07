import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { isMaintenanceModeEnabled, setMaintenanceMode } from "@/lib/system-state";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  return NextResponse.json({ maintenanceMode: await isMaintenanceModeEnabled() });
}

const patchSchema = z.object({ maintenanceMode: z.boolean() });

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await setMaintenanceMode(parsed.data.maintenanceMode, guard.session.user.id);
  return NextResponse.json({ maintenanceMode: parsed.data.maintenanceMode });
}
