"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function WorkloadActions({
  workloadId,
  assignedAgentId,
  agents,
}: {
  workloadId: string;
  assignedAgentId: string | null;
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState(assignedAgentId ?? agents[0]?.id ?? "");

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

  return (
    <div className="flex flex-col items-end gap-1">
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
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
