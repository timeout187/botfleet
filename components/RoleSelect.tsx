"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["member", "admin", "owner"] as const;

export function RoleSelect({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={currentRole}
        disabled={disabled || pending}
        onChange={async (e) => {
          setPending(true);
          setError(null);
          const res = await fetch(`/api/admin/users/${userId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ role: e.target.value }),
          });
          setPending(false);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body.error ?? "Failed to update role");
            return;
          }
          router.refresh();
        }}
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500 disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
