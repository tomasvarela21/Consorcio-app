import { clsx } from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  PropsWithChildren & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    loading?: boolean;
  };

export function Button({
  children,
  className,
  variant = "primary",
  loading,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70 disabled:cursor-not-allowed";
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary:
      "bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900",
    secondary:
      "bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50 focus-visible:outline-slate-900",
    ghost:
      "text-slate-700 hover:bg-slate-100 border border-transparent focus-visible:outline-slate-900",
    danger:
      "bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600",
  };

  return (
    <button
      className={clsx(base, variants[variant], className)}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
      )}
      {children}
    </button>
  );
}
