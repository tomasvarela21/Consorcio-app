"use client";

import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import toast from "react-hot-toast";

type HeaderProps = {
  title?: string;
  subtitle?: string;
  userEmail?: string;
};

export function Header({ title, subtitle, userEmail }: HeaderProps) {
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
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
      <div>
        {title && <h1 className="text-xl font-semibold text-slate-900">{title}</h1>}
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
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
