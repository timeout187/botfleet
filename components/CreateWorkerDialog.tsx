"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CreateWorkerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    mode: "pm2" as "pm2" | "docker",
    maxBots: 5,
    host: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create worker");
      return;
    }
    setOpen(false);
    setForm({ ...form, name: "", host: "" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">Add worker</Button>
      </DialogTrigger>
      <DialogContent title="Add worker">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              placeholder="worker-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Runner mode</label>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as "pm2" | "docker" })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            >
              <option value="pm2">PM2</option>
              <option value="docker">Docker</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Max bots (3-5 recommended)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxBots}
              onChange={(e) => setForm({ ...form, maxBots: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Host (optional)</label>
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              placeholder="worker-1.internal"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
