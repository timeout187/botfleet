import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-zinc-50",
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-red-400",
  }[tone];

  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={cn("mt-2 text-3xl font-semibold tabular-nums", toneClass)}>{value}</div>
    </Card>
  );
}
