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
      "bg-gradient-to-r from-slate-900 via-indigo-900 to-indigo-800 text-white shadow-lg shadow-indigo-900/30 hover:from-slate-800 hover:via-indigo-800 hover:to-indigo-700 focus-visible:outline-indigo-900",
    secondary:
      "border border-cyan-200/60 bg-gradient-to-r from-cyan-50 via-sky-50 to-sky-100 text-slate-900 shadow-sm hover:from-cyan-100 hover:via-sky-100 hover:to-sky-200 focus-visible:outline-sky-600",
    ghost:
      "text-slate-700 hover:bg-slate-900/5 border border-transparent focus-visible:outline-indigo-900",
    danger:
      "bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md shadow-rose-500/30 hover:from-rose-500 hover:to-rose-400 focus-visible:outline-rose-600",
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
