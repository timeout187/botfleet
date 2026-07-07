import { cn } from "@/lib/cn";

const VARIANT_CLASSES = {
  neutral: "bg-zinc-800 text-zinc-300 ring-zinc-700",
  success: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  danger: "bg-red-500/10 text-red-400 ring-red-500/30",
  info: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/30",
} as const;

export type BadgeVariant = keyof typeof VARIANT_CLASSES;

export function Badge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
