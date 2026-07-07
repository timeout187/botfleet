"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type JobState = "idle" | "queued" | "polling" | "done" | "error";

export function ExplainCrashButton({ botId }: { botId: string }) {
  const [state, setState] = useState<JobState>("idle");
  const [result, setResult] = useState<{
    summary: string;
    suggestedAction: string;
    confidence: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setState("queued");
    setError(null);
    setResult(null);

    const res = await fetch(`/api/admin/bots/${botId}/explain-crash`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to queue crash explanation.");
      setState("error");
      return;
    }

    setState("polling");
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const statusRes = await fetch(`/api/admin/ai/jobs/${body.jobId}`);
      const statusBody = await statusRes.json().catch(() => ({}));
      if (statusBody.state === "completed") {
        setResult(statusBody.result);
        setState("done");
        return;
      }
      if (statusBody.state === "failed") {
        setError(statusBody.failedReason ?? "Analysis failed.");
        setState("error");
        return;
      }
    }
    setError("Timed out waiting for the AI worker. Is `npm run worker:ai` running?");
    setState("error");
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        onClick={onClick}
        disabled={state === "queued" || state === "polling"}
      >
        {state === "polling" ? "Analyzing…" : "Explain this crash"}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
          <div className="text-zinc-200">{result.summary}</div>
          <div className="mt-1 text-zinc-400">Suggested: {result.suggestedAction}</div>
          <div className="mt-1 text-zinc-600">
            Confidence: {result.confidence} · rule-based, not an LLM call - see docs/architecture.md
          </div>
        </div>
      )}
    </div>
  );
}
