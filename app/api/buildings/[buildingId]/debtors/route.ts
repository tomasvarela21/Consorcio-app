import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { getUnitMorosoSummary } from "@/lib/morosos";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }
  const { buildingId: buildingParam } = await params;
  const buildingId = Number(buildingParam);
  if (Number.isNaN(buildingId)) {
    return NextResponse.json({ message: "Edificio inválido" }, { status: 400 });
  }
  const today = new Date();

  const candidateUnits = await prisma.settlementCharge.findMany({
    where: {
      settlement: {
        buildingId,
        dueDate2: { not: null, lt: today },
      },
      OR: [
        { totalToPay: { gt: 0 } },
        {
          AND: [
            { lateFeeAmount: { gt: 0 } },
            { status: { not: "PAID" } },
          ],
        },
      ],
    },
    distinct: ["unitId"],
    select: { unitId: true },
  });

  const unitIds = candidateUnits.map((c) => c.unitId);
  if (!unitIds.length) {
    return NextResponse.json([]);
  }

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    include: { contacts: true },
  });

  const unitMap = new Map(units.map((u) => [u.id, u]));

  const summaries = await Promise.all(
    unitIds.map((unitId) => getUnitMorosoSummary(unitId, today)),
  );

  const result = summaries
    .filter((summary) => summary.totalMoroso > 0)
    .map((summary) => {
      const unit = unitMap.get(summary.unitId);
      const responsable =
        unit?.contacts.find((c) => c.role === "RESPONSABLE")?.fullName ??
        "Sin responsable";
      return {
        unitId: summary.unitId,
        unitCode: unit?.code ?? "",
        responsable,
        creditBalance: Number(unit?.creditBalance ?? 0),
        totalDebt: summary.totalMoroso,
        periods: summary.bySettlement.map((period) => ({
          settlementId: period.settlementId,
          month: period.month,
          year: period.year,
          originalDebt: period.originalDebt,
          deudaPendiente: period.deudaOriginalLiquidacionPendiente,
          partialPayments: period.partialPrincipalPaid,
          monthsLate: period.monthsLate,
          latePercentage: period.lateFeePercentage,
          lateAmount: period.lateAmountTotal,
          lateAmountPending: period.lateAmountPending,
          pendingAmount: period.totalMorosoLiquidacionPendiente,
        })),
      };
    })
    .sort((a, b) => a.unitCode.localeCompare(b.unitCode));

  return NextResponse.json(result);
}
