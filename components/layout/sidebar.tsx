"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/buildings", label: "Edificios" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="global-sidebar flex min-h-screen w-64 flex-col gap-6 self-stretch border-r border-slate-900/40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 px-5 py-8 text-slate-100 shadow-xl"
    >
      <div className="space-y-2 px-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400/80">
          Panel administrador
        </p>
        <div className="text-2xl font-semibold text-white">Gestión de Consorcios</div>
        <span className="block h-1 w-12 rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500" />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40",
                active
                  ? "bg-white/15 text-white shadow-lg shadow-black/20"
                  : "text-slate-200 hover:bg-white/10",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
