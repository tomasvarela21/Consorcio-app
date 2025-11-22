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
      className="global-sidebar flex min-h-screen w-64 flex-col gap-4 self-stretch border-r border-slate-200 bg-slate-900 px-4 py-6 text-slate-100"
    >
      <div className="px-2">
        <div className="text-lg font-semibold">Gestión de Consorcios</div>
        <p className="text-xs text-slate-300">Panel administrador</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition hover:bg-slate-800",
                active && "bg-slate-800 text-white",
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
