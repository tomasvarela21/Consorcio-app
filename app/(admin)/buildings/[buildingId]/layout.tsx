import { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { BuildingNav } from "@/components/buildings/building-nav";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { calculateLateFee } from "@/lib/billing";
import { formatCurrency } from "@/lib/format";

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

  const today = new Date();

  const [building, unitsCount, chargesPending, lastSettlement] =
    await Promise.all([
      prisma.building.findUnique({ where: { id: buildingId } }),
      prisma.unit.count({ where: { buildingId } }),
      prisma.settlementCharge.findMany({
        where: {
          settlement: {
            buildingId,
            dueDate2: { lt: today },
            NOT: { dueDate2: null },
          },
          totalToPay: { gt: 0 },
        },
        include: { settlement: true },
      }),
      prisma.settlement.findFirst({
        where: { buildingId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
    ]);

  if (!building) {
    redirect("/buildings");
  }

  const deudaTotal = chargesPending.reduce((acc, charge) => {
    const dueDate = charge.settlement.dueDate2;
    if (!dueDate) {
      return acc;
    }
    const baseDebt = Number(charge.previousBalance) + Number(charge.currentFee);
    const { totalWithLate } = calculateLateFee(
      baseDebt,
      dueDate,
      today,
      Number(charge.settlement.lateFeePercentage ?? 10),
    );
    const payments = Number(charge.partialPaymentsTotal ?? 0);
    return acc + Math.max(0, totalWithLate - payments);
  }, 0);

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .admin-shell-sidebar { display: none !important; }
          `,
        }}
      />
      <aside className="w-full space-y-4 lg:w-72">
        <div className="sticky top-6 space-y-4">
          <Card className="border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-2xl shadow-slate-900/50">
            <Link href="/dashboard" className="inline-flex w-full items-center justify-start text-sm font-semibold text-white/80 transition hover:text-white">
              ← Volver al dashboard
            </Link>
            <p className="text-xs uppercase tracking-wide text-slate-300">Edificio</p>
            <h1 className="text-xl font-semibold text-white underline decoration-white/60 underline-offset-4">
              {building.name}
            </h1>
            <p className="text-sm text-slate-300">{building.address}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-200/90">
              <p>
                Unidades:{" "}
                <span className="font-semibold text-white">{unitsCount}</span>
              </p>
              <p>
                Deuda estimada:{" "}
                <span className="font-semibold text-white">
                  {formatCurrency(deudaTotal)}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Última liquidación:{" "}
                {lastSettlement
                  ? `${lastSettlement.month}/${lastSettlement.year}`
                  : "No hay liquidaciones"}
              </p>
              <div className="mt-3">
                <Link href={`/buildings/${buildingId}/settlements`}>
                  <Button variant="secondary" className="w-full !border-white/30 !bg-white/10 !text-black hover:!bg-white/20">
                    Nueva liquidación
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700/90 ">
            <BuildingNav buildingId={building.id} orientation="vertical" />
          </Card>
        </div>
      </aside>
      <section className="flex-1 space-y-4">{children}</section>
    </div>
  );
}
