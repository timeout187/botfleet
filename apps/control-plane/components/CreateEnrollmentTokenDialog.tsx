"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CreateEnrollmentTokenDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [form, setForm] = useState({ environment: "", ttlMinutes: 30 });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/admin/agents/enrollment-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        environment: form.environment || undefined,
        ttlMinutes: form.ttlMinutes,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to create enrollment token");
      return;
    }
    setIssuedToken({ token: body.token, expiresAt: body.expiresAt });
    router.refresh();
  }

  function close() {
    setOpen(false);
    setIssuedToken(null);
    setForm({ environment: "", ttlMinutes: 30 });
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="primary">New enrollment token</Button>
      </DialogTrigger>
      <DialogContent title="Create agent enrollment token">
        {issuedToken ? (
          <div className="space-y-4">
            <p className="text-xs text-amber-400">
              This token is shown once and is never stored in plaintext - copy it now. Expires{" "}
              {new Date(issuedToken.expiresAt).toLocaleString()}.
            </p>
            <code className="block break-all rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
              {issuedToken.token}
            </code>
            <p className="text-xs text-zinc-500">
              Set it as <code className="text-zinc-400">BOTFLEET_AGENT_ENROLLMENT_TOKEN</code> on
              the machine running <code className="text-zinc-400">npm run agent:dev</code> - see
              docs/agent-installation.md.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-xs text-zinc-500">
              Single-use, expiring, hashed at rest - see docs/security.md. Hand it to a new agent
              out of band.
            </p>
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Restrict to environment (optional)
              </label>
              <input
                value={form.environment}
                onChange={(e) => setForm({ ...form, environment: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                placeholder="production"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">Expires in (minutes)</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={form.ttlMinutes}
                onChange={(e) => setForm({ ...form, ttlMinutes: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
