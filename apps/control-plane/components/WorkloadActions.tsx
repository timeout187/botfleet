"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function WorkloadActions({
  workloadId,
  assignedAgentId,
  agents,
  reconciliationSuspended,
}: {
  workloadId: string;
  assignedAgentId: string | null;
  agents: { id: string; name: string }[];
  reconciliationSuspended?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState(assignedAgentId ?? agents[0]?.id ?? "");
  const [recommendation, setRecommendation] = useState<{
    selectedAgentId: string | null;
    reason: string;
    candidates: { agentId: string; agentName: string; eligible: boolean; totalScore: number }[];
  } | null>(null);

  async function recommend() {
    setPending("recommend");
    setError(null);
    setRecommendation(null);
    const res = await fetch(`/api/admin/workloads/${workloadId}/schedule`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) {
      setError(body.error ?? "Failed to compute a recommendation");
      return;
    }
    setRecommendation(body.decision);
    if (body.decision.selectedAgentId) {
      setSelectedAgent(body.decision.selectedAgentId);
    }
  }

  async function runCommand(command: "start" | "stop" | "restart") {
    setPending(command);
    setError(null);
    const res = await fetch(`/api/admin/workloads/${workloadId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) setError(body.error ?? `Failed to ${command}`);
    router.refresh();
  }

  async function assign() {
    setPending("assign");
    setError(null);
    const res = await fetch(`/api/admin/workloads/${workloadId}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: selectedAgent }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) setError(body.error ?? "Failed to assign");
    router.refresh();
  }

  async function clearFailure() {
    setPending("clear-failure");
    setError(null);
    const res = await fetch(`/api/admin/workloads/${workloadId}/clear-failure`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) setError(body.error ?? "Failed to clear");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" disabled={pending !== null} onClick={recommend} className="text-xs">
        {pending === "recommend" ? "Scoring…" : "Get recommendation"}
      </Button>
      {recommendation && (
        <div className="max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-right text-xs text-zinc-400">
          <p className="text-zinc-300">{recommendation.reason}</p>
          {recommendation.candidates.map((c) => (
            <p key={c.agentId} className={c.eligible ? "" : "text-zinc-600 line-through"}>
              {c.agentName}: {c.eligible ? c.totalScore : "ineligible"}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" disabled={pending !== null || !selectedAgent} onClick={assign}>
          {pending === "assign" ? "Assigning…" : "Assign"}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending !== null} onClick={() => runCommand("start")}>
          {pending === "start" ? "Starting…" : "Start"}
        </Button>
        <Button variant="secondary" disabled={pending !== null} onClick={() => runCommand("stop")}>
          {pending === "stop" ? "Stopping…" : "Stop"}
        </Button>
        <Button variant="ghost" disabled={pending !== null} onClick={() => runCommand("restart")}>
          {pending === "restart" ? "Restarting…" : "Restart"}
        </Button>
      </div>
      {reconciliationSuspended && (
        <Button
          variant="ghost"
          disabled={pending !== null}
          onClick={clearFailure}
          className="text-xs"
        >
          {pending === "clear-failure" ? "Clearing…" : "Clear reconciliation failure"}
        </Button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
