"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangeWorkerSelect({
  botId,
  currentWorkerId,
  workers,
}: {
  botId: string;
  currentWorkerId: string | null;
  workers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <select
      defaultValue={currentWorkerId ?? ""}
      disabled={pending}
      onChange={async (e) => {
        setPending(true);
        await fetch(`/api/admin/bots/${botId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workerGroupId: e.target.value || null }),
        });
        setPending(false);
        router.refresh();
      }}
      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500 disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {workers.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
