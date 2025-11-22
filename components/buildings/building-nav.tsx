"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const tabItems = [
  { slug: "", label: "Dashboard", icon: "📊" },
  { slug: "/residents", label: "Residentes", icon: "👥" },
  { slug: "/settlements", label: "Liquidaciones", icon: "🧾" },
  { slug: "/payments", label: "Historial de pagos", icon: "💳" },
  { slug: "/debtors", label: "Morosos", icon: "⚠️" },
];

type Props = {
  buildingId: number;
  orientation?: "horizontal" | "vertical";
};

export function BuildingNav({ buildingId, orientation = "horizontal" }: Props) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";
  return (
    <div
      className={clsx(
        "rounded-2xl shadow-lg",
        vertical
          ? "space-y-1 border border-slate-800/50 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 p-3 text-slate-100"
          : "flex flex-wrap gap-2 border border-slate-200/70 bg-white/90 px-4 py-2",
      )}
    >
      {tabItems.map((tab) => {
        const href = `/buildings/${buildingId}${tab.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={clsx(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
              vertical
                ? active
                  ? "bg-white/20 text-white shadow-inner"
                  : "text-slate-200 hover:bg-white/10"
                : active
                  ? "bg-gradient-to-r from-slate-900 via-indigo-900 to-indigo-800 text-white shadow-lg shadow-indigo-900/20"
                  : "text-slate-600 hover:bg-slate-900/5",
            )}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
