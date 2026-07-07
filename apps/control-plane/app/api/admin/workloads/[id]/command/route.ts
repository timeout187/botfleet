import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { sendWorkloadCommand } from "@/lib/workloads";

const commandSchema = z.object({ command: z.enum(["start", "stop", "restart"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = commandSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await sendWorkloadCommand(id, parsed.data.command, guard.session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
