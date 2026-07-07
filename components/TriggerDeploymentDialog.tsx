"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TriggerDeploymentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ version: "", commitSha: "", notes: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/admin/deployments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Deployment failed - see /admin/logs for details.");
      setOpen(false);
      router.refresh();
      return;
    }
    setOpen(false);
    setForm({ version: "", commitSha: "", notes: "" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">Trigger deployment</Button>
      </DialogTrigger>
      <DialogContent title="Trigger a deployment">
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-xs text-zinc-500">
            Runs every registered plugin&apos;s deployment hooks (see /admin/plugins) and records
            the result. There&apos;s no process draining/staggered restart behind this yet.
          </p>
          <div>
            <label className="text-xs font-medium text-zinc-400">Version</label>
            <input
              required
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              placeholder="0.2.0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Commit SHA</label>
            <input
              required
              value={form.commitSha}
              onChange={(e) => setForm({ ...form, commitSha: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              placeholder="a1b2c3d"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Notes (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Deploying…" : "Deploy"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
