import { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { BuildingNav } from "@/components/buildings/building-nav";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function BuildingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ buildingId: string }>;
}) {
  const { buildingId: buildingParam } = await params;
  const buildingId = Number(buildingParam);
  if (Number.isNaN(buildingId)) {
    redirect("/buildings");
  }

  const [building, unitsCount, chargesPending, lastSettlement] =
    await Promise.all([
      prisma.building.findUnique({ where: { id: buildingId } }),
      prisma.unit.count({ where: { buildingId } }),
      prisma.settlementCharge.aggregate({
        _sum: { totalToPay: true },
        where: {
          settlement: { buildingId },
          status: { in: ["PENDING", "PARTIAL"] },
        },
      }),
      prisma.settlement.findFirst({
        where: { buildingId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
    ]);

  if (!building) {
    redirect("/buildings");
  }

  const deudaTotal = Number(chargesPending._sum.totalToPay ?? 0);

  return (
    <div className="flex gap-4">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .global-sidebar { display: none !important; }
          `,
        }}
      />
      <aside className="w-72 space-y-4">
        <div className="sticky top-6 space-y-4">
          <Card className="p-4">
            <Link href="/dashboard" className="inline-flex w-full items-center justify-start text-sm font-semibold text-slate-700 hover:text-slate-900">
              ← Volver al dashboard
            </Link>
            <p className="text-xs uppercase tracking-wide text-slate-500">Edificio</p>
            <h1 className="text-xl font-semibold text-slate-900">{building.name}</h1>
            <p className="text-sm text-slate-500">{building.address}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>
                Unidades:{" "}
                <span className="font-semibold text-slate-900">{unitsCount}</span>
              </p>
              <p>
                Deuda estimada:{" "}
                <span className="font-semibold text-slate-900">
                  ${deudaTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Última liquidación:{" "}
                {lastSettlement
                  ? `${lastSettlement.month}/${lastSettlement.year}`
                  : "No hay liquidaciones"}
              </p>
              <div className="mt-3">
                <Link href={`/buildings/${buildingId}/settlements`}>
                  <Button variant="secondary" className="w-full">
                    Nueva liquidación
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
          <Card className="p-0">
            <BuildingNav buildingId={building.id} orientation="vertical" />
          </Card>
        </div>
      </aside>
      <section className="flex-1 space-y-4">{children}</section>
    </div>
  );
}
