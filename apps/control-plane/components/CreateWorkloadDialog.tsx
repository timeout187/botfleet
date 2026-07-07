"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const EXAMPLE_SPEC = `{
  "apiVersion": "botfleet.io/v1",
  "kind": "DiscordBot",
  "metadata": { "name": "example-bot" },
  "spec": {
    "runtime": {
      "type": "node",
      "command": "node",
      "args": ["dist/index.js"],
      "workingDirectory": "/opt/bots/example"
    },
    "runner": { "type": "pm2" },
    "health": { "restartPolicy": "on-failure", "maxRestartAttempts": 5 },
    "placement": { "requiredLabels": { "region": "eu-central" } }
  }
}`;

export function CreateWorkloadDialog({ bots }: { bots: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [specText, setSpecText] = useState(EXAMPLE_SPEC);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    let specification: unknown;
    try {
      specification = JSON.parse(specText);
    } catch {
      setError("Specification is not valid JSON");
      setPending(false);
      return;
    }

    const res = await fetch("/api/admin/workloads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botId, specification }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.issues?.join("; ") ?? body.error ?? "Failed to create workload");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">New workload</Button>
      </DialogTrigger>
      <DialogContent title="Create a workload">
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-xs text-zinc-500">
            Validated against @botfleet/workload-spec before it&apos;s ever stored - see
            docs/runtime-sdk.md and docs/architecture.md.
          </p>
          <div>
            <label className="text-xs font-medium text-zinc-400">Bot</label>
            <select
              required
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Specification (JSON)</label>
            <textarea
              required
              rows={14}
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending || !botId}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
