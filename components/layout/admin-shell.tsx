"use client";

import { ReactNode, useState } from "react";
import { clsx } from "clsx";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

type AdminShellProps = {
  children: ReactNode;
  userEmail?: string;
};

export function AdminShell({ children, userEmail }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="admin-shell relative flex min-h-screen w-full bg-slate-100/80 lg:h-screen lg:overflow-hidden">
      <div
        className={clsx(
          "admin-shell-sidebar fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 lg:static lg:flex-shrink-0 lg:h-full lg:translate-x-0 lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar className="flex h-full flex-col lg:h-screen" onNavigate={closeSidebar} />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <div className="flex min-h-screen w-full flex-1 flex-col lg:h-screen lg:min-h-0">
        <Header
          title="Panel de administración"
          subtitle="Control de edificios y expensas"
          userEmail={userEmail}
          showMenuButton
          onMenuClick={() => setSidebarOpen((prev) => !prev)}
          className="admin-shell-header"
        />
        <main className="admin-shell-main flex-1 w-full bg-slate-100/80 px-4 py-6 sm:p-6 lg:overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
