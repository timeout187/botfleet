import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getCrashExplanationJob } from "@/lib/queue/ai-queue";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { jobId } = await params;
  const job = await getCrashExplanationJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const state = await job.getState();
  return NextResponse.json({
    id: job.id,
    state,
    result: state === "completed" ? job.returnvalue : null,
    failedReason: state === "failed" ? job.failedReason : null,
  });
}
