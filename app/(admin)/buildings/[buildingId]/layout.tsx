import { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { calculateLateFee } from "@/lib/billing";
import { BuildingSidebar } from "@/components/buildings/building-sidebar";

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

  const buildingInfo = {
    id: building.id,
    name: building.name,
    address: building.address,
  };

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

  const safeLastSettlement = lastSettlement
    ? {
        id: lastSettlement.id,
        buildingId: lastSettlement.buildingId,
        month: lastSettlement.month,
        year: lastSettlement.year,
        dueDate1: lastSettlement.dueDate1,
        dueDate2: lastSettlement.dueDate2,
      }
    : null;

  return (
    <div className="building-view relative flex w-full flex-col gap-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .admin-shell-sidebar {
              opacity: 0 !important;
              pointer-events: none !important;
            }
            .admin-shell-main {
              padding: 0 !important;
            }
            .admin-shell-header-menu {
              display: none !important;
            }
            @media (min-width: 1024px) {
              .admin-shell-header {
                padding-left: calc(2rem + 1.5rem) !important;
              }
            }
          `,
        }}
      />
      <BuildingSidebar
        building={buildingInfo}
        unitsCount={unitsCount}
        totalDebt={deudaTotal}
        lastSettlement={safeLastSettlement}
      />
      <section className="flex-1 space-y-4 px-4 py-6 sm:px-6 lg:pl-14">{children}</section>
    </div>
  );
}
