"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function WebhookRowActions({ webhookId }: { webhookId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-xs text-zinc-500">{status}</span>}
      <Button
        variant="secondary"
        onClick={async () => {
          setStatus("Sending…");
          const res = await fetch("/api/admin/alerts/test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ webhookId }),
          });
          const body = await res.json().catch(() => ({}));
          setStatus(body.ok ? "Sent ✓" : `Failed (${body.status ?? "error"})`);
          router.refresh();
        }}
      >
        Send test
      </Button>
      <Button
        variant="danger"
        onClick={async () => {
          await fetch(`/api/admin/webhooks/${webhookId}`, { method: "DELETE" });
          router.refresh();
        }}
      >
        Remove
      </Button>
    </div>
  );
}
