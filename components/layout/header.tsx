"use client";

import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import { clsx } from "clsx";

type HeaderProps = {
  title?: string;
  subtitle?: string;
  userEmail?: string;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
  className?: string;
};

export function Header({ title, subtitle, userEmail, showMenuButton, onMenuClick, className }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (res.ok) {
      router.push("/login");
    } else {
      toast.error("No pudimos cerrar sesión");
    }
  };

  return (
    <header
      className={clsx(
        "flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <Button
            type="button"
            variant="ghost"
            className="admin-shell-header-menu h-10 w-10 p-0 lg:hidden"
            aria-label="Abrir menú de navegación"
            onClick={onMenuClick}
          >
            <MenuIcon className="h-5 w-5 text-slate-700" />
          </Button>
        )}
        <div>
          {title && <h1 className="text-xl font-semibold text-slate-900">{title}</h1>}
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {userEmail && (
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{userEmail}</span>
          </div>
        )}
        <Button variant="secondary" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}
