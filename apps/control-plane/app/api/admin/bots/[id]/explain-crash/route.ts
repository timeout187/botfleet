import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { enqueueCrashExplanation } from "@/lib/queue/ai-queue";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const health = await db.botHealth.findUnique({ where: { botId: id } });
  if (!health?.lastErrorSafe) {
    return NextResponse.json(
      { error: "This bot has no recorded error to explain." },
      { status: 422 },
    );
  }

  try {
    const jobId = await enqueueCrashExplanation({ botId: id, errorMessage: health.lastErrorSafe });
    return NextResponse.json({ jobId });
  } catch (err) {
    if (err instanceof Error && err.message.includes("REDIS_URL")) {
      return NextResponse.json(
        { error: "The AI worker queue isn't configured (REDIS_URL is not set)." },
        { status: 503 },
      );
    }
    throw err;
  }
}
