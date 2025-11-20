import { clsx } from "clsx";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const map: Record<NonNullable<typeof variant>, string> = {
    default: "bg-slate-100 text-slate-800",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", map[variant], className)}>
      {children}
    </span>
  );
}
