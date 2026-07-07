"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function MaintenanceModeToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-200">Maintenance mode</p>
        <p className="text-xs text-zinc-500">
          Blocks customer-triggered bot restarts and marks the public status page as under
          maintenance.
        </p>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={enabled ? "warning" : "success"}>{enabled ? "Enabled" : "Disabled"}</Badge>
        <Button
          variant={enabled ? "secondary" : "primary"}
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const next = !enabled;
            const res = await fetch("/api/admin/system-state", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ maintenanceMode: next }),
            });
            const body = await res.json().catch(() => ({}));
            setPending(false);
            if (res.ok) {
              setEnabled(body.maintenanceMode);
            } else {
              setError(body.error ?? "Failed to update maintenance mode");
            }
            router.refresh();
          }}
        >
          {pending ? "Saving…" : enabled ? "Disable" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
