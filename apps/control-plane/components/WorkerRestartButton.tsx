"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function WorkerRestartButton({ workerId }: { workerId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await fetch(`/api/admin/workers/${workerId}/restart`, { method: "POST" });
        router.refresh();
      }}
    >
      Restart
    </Button>
  );
}
