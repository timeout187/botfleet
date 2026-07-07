"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function ConfirmButton({
  label,
  confirmTitle,
  confirmBody,
  variant = "secondary",
  onConfirm,
}: {
  label: string;
  confirmTitle: string;
  confirmBody: string;
  variant?: "primary" | "secondary" | "danger";
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={confirmTitle}>
        <p className="text-sm text-zinc-400">{confirmBody}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await onConfirm();
              setPending(false);
              setOpen(false);
            }}
          >
            {pending ? "Working…" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BotActions({ botId }: { botId: string }) {
  const router = useRouter();

  async function callAction(path: string) {
    await fetch(`/api/admin/bots/${botId}/${path}`, { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton
        label="Start"
        confirmTitle="Start bot"
        confirmBody="This will bring the bot online."
        variant="primary"
        onConfirm={() => callAction("start")}
      />
      <ConfirmButton
        label="Stop"
        confirmTitle="Stop bot"
        confirmBody="This will take the bot offline for all of its guilds."
        onConfirm={() => callAction("stop")}
      />
      <ConfirmButton
        label="Restart"
        confirmTitle="Restart bot"
        confirmBody="This will stop and start the bot, incrementing its restart count."
        onConfirm={() => callAction("restart")}
      />
      <RotateTokenButton botId={botId} />
    </div>
  );
}

function RotateTokenButton({ botId }: { botId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/admin/bots/${botId}/rotate-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to rotate token");
      return;
    }
    setOpen(false);
    setToken("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger">Rotate token</Button>
      </DialogTrigger>
      <DialogContent title="Rotate bot token">
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-zinc-400">
            The new token is encrypted immediately and never shown again. The old token stops
            working the moment you confirm.
          </p>
          <input
            required
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="New bot token"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Rotating…" : "Rotate token"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
