import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  return <AdminShell userEmail={session.email}>{children}</AdminShell>;
}
