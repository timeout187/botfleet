import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { drainWorker, WorkerNotFoundError } from "@/lib/workers/drain";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const result = await drainWorker(id, guard.session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WorkerNotFoundError) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }
    throw err;
  }
}
