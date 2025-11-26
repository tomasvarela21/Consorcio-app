import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { calculateLateFee } from "@/lib/billing";

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

  const charges = await prisma.settlementCharge.findMany({
    where: {
      totalToPay: { gt: 0 },
      settlement: {
        buildingId: buildingId,
        dueDate2: { lt: today },
        NOT: { dueDate2: null },
      },
    },
    include: {
      settlement: true,
      unit: { include: { contacts: true } },
    },
  });

  const grouped: Record<
    number,
    {
      unitId: number;
      unitCode: string;
      responsable: string;
      periods: Array<{
        settlementId: number;
        month: number;
        year: number;
        originalDebt: number;
        monthsLate: number;
        lateAmount: number;
        totalWithLate: number;
      }>;
    }
  > = {};

  charges.forEach((charge) => {
    if (!charge.settlement.dueDate2) return;
    const { monthsLate, lateAmount, totalWithLate } = calculateLateFee(
      Number(charge.totalToPay),
      charge.settlement.dueDate2,
      today,
      Number(charge.settlement.lateFeePercentage ?? 10),
    );
    const key = charge.unitId;
    const responsable =
      charge.unit.contacts.find((c) => c.role === "RESPONSABLE")?.fullName ??
      "Sin responsable";
    if (!grouped[key]) {
      grouped[key] = {
        unitId: charge.unitId,
        unitCode: charge.unit.code,
        responsable,
        periods: [],
      };
    }
    grouped[key].periods.push({
      settlementId: charge.settlementId,
      month: charge.settlement.month,
      year: charge.settlement.year,
      originalDebt: Number(charge.totalToPay),
      monthsLate,
      lateAmount,
      totalWithLate,
    });
  });

  const result = Object.values(grouped).map((item) => ({
    ...item,
    totalDebt: item.periods.reduce((acc, p) => acc + p.totalWithLate, 0),
  }));

  return NextResponse.json(result);
}
