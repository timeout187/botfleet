import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary: "bg-indigo-500 text-white hover:bg-indigo-400",
  secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ring-1 ring-inset ring-zinc-700",
  danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-inset ring-red-500/30",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
} as const;

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT_CLASSES }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
