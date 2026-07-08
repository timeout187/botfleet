"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AgentDrainButton({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setStatus(null);
          const res = await fetch(`/api/admin/agents/${agentId}/drain`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setPending(false);
          if (res.ok) {
            setStatus(
              body.stranded?.length
                ? `Relocated ${body.relocated.length}, ${body.stranded.length} stranded (no capacity elsewhere)`
                : `Relocated ${body.relocated.length} workload(s), agent is now disabled`,
            );
          } else {
            setStatus(body.error ?? "Failed to drain agent");
          }
          router.refresh();
        }}
      >
        {pending ? "Draining…" : "Drain"}
      </Button>
      {status && <p className="text-xs text-zinc-500">{status}</p>}
    </div>
  );
}
