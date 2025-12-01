"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

import { BuildingNav } from "@/components/buildings/building-nav";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type BuildingSidebarProps = {
  building: {
    id: number;
    name: string;
    address: string | null;
  };
  unitsCount: number;
  totalDebt: number;
  lastSettlement: {
    id: number;
    buildingId: number;
    month: number;
    year: number;
    dueDate1: Date | null;
    dueDate2: Date | null;
  } | null;
  className?: string;
};

export function BuildingSidebar({
  building,
  unitsCount,
  totalDebt,
  lastSettlement,
  className,
}: BuildingSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const panelClasses =
    "building-sidebar flex h-full w-full flex-col gap-6 border border-white/5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 px-6 py-7 text-slate-100 shadow-2xl shadow-black/40";

  const content = (
    <>
      <div className="space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm font-semibold text-white/80 transition hover:text-white"
          onClick={() => setMobileOpen(false)}
        >
          ← Volver al dashboard
        </Link>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-400/80">
            Edificio
          </p>
          <h1 className="text-2xl font-semibold text-white">{building.name}</h1>
          <p className="text-sm text-slate-300">{building.address}</p>
        </div>
      </div>
      <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 shadow-inner shadow-black/30">
        <p>
          Unidades: <span className="font-semibold text-white">{unitsCount}</span>
        </p>
        <p>
          Deuda estimada:{" "}
          <span className="font-semibold text-white">
            {formatCurrency(totalDebt)}
          </span>
        </p>
        <p className="text-xs text-slate-300">
          Última liquidación:{" "}
          {lastSettlement
            ? `${lastSettlement.month}/${lastSettlement.year}`
            : "No hay liquidaciones"}
        </p>
        <div className="pt-2">
          <Link href={`/buildings/${building.id}/settlements`} onClick={() => setMobileOpen(false)}>
            <Button className="w-full bg-white/90 text-slate-900 hover:bg-white">
              Nueva liquidación
            </Button>
          </Link>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-400/80">
          Navegación
        </p>
        <BuildingNav
          buildingId={building.id}
          orientation="vertical"
          variant="sidebar"
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-3 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg shadow-black/30 transition hover:bg-slate-800 lg:hidden"
        aria-label="Abrir menú del edificio"
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="20" y1="7" y2="7" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="17" y2="17" />
        </svg>
      </button>

      <div
        className={clsx(
          "fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileOpen ? "visible opacity-100" : "invisible opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-72 -translate-x-full transition-transform duration-300 lg:hidden",
          mobileOpen && "translate-x-0",
          className,
        )}
      >
        <div className={panelClasses}>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="self-end text-sm font-semibold text-white/70 transition hover:text-white"
          >
            Cerrar ✕
          </button>
          {content}
        </div>
      </aside>

      <aside
        className={clsx(
          "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:border-r lg:border-white/10 lg:px-0 lg:py-0 lg:shadow-[0_0_35px_rgba(0,0,0,0.4)]",
          className,
        )}
      >
        <div className={panelClasses}>{content}</div>
      </aside>
    </>
  );
}
