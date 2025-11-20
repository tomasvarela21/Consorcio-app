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
        "rounded-lg border border-slate-200 bg-white shadow-sm",
        vertical ? "p-3 space-y-1" : "flex flex-wrap gap-2 px-4 py-2",
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
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
              active
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100",
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
