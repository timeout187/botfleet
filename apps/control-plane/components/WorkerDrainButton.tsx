"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function WorkerDrainButton({ workerId }: { workerId: string }) {
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
          const res = await fetch(`/api/admin/workers/${workerId}/drain`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setPending(false);
          if (res.ok) {
            setStatus(
              body.strandedBotIds?.length
                ? `Moved ${body.movedBotIds.length}, ${body.strandedBotIds.length} stranded (no capacity elsewhere)`
                : `Moved ${body.movedBotIds.length} bot(s), worker is now offline`,
            );
          } else {
            setStatus(body.error ?? "Failed to drain worker");
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
