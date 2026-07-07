"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EvaluateAlertRulesButton() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setStatus(null);
          const res = await fetch("/api/admin/alerts/evaluate", { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setPending(false);
          setStatus(
            res.ok
              ? `Evaluated ${body.rulesEvaluated} rule(s), created ${body.alertsCreated.length} alert(s).`
              : "Failed to evaluate alert rules.",
          );
          router.refresh();
        }}
      >
        {pending ? "Evaluating…" : "Evaluate alert rules now"}
      </Button>
      {status && <span className="text-xs text-zinc-500">{status}</span>}
    </div>
  );
}
