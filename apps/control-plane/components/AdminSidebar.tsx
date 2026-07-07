"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/admin", label: "Fleet Overview" },
  { href: "/admin/bots", label: "Bots" },
  { href: "/admin/workers", label: "Workers" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/workloads", label: "Workloads" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/deployments", label: "Deployments" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/status", label: "Status" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/plugins", label: "Plugins" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex h-full w-56 flex-col gap-1 border-r border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-4 px-2 text-lg font-semibold tracking-tight text-zinc-50">BotFleet</div>
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-zinc-800 text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
