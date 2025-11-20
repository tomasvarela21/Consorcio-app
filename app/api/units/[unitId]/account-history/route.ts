import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: { unitId: string } },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }
  const unitId = Number(params.unitId);
  if (!unitId) {
    return NextResponse.json({ message: "Unidad inválida" }, { status: 400 });
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: { building: true, contacts: true },
  });
  if (!unit) {
    return NextResponse.json({ message: "No encontrado" }, { status: 404 });
  }

  const [charges, payments] = await Promise.all([
    prisma.settlementCharge.findMany({
      where: { unitId },
      include: { settlement: true },
      orderBy: [
        { settlement: { year: "desc" } },
        { settlement: { month: "desc" } },
      ],
    }),
    prisma.payment.findMany({
      where: { unitId },
      orderBy: { paymentDate: "desc" },
    }),
  ]);

  const responsable = unit.contacts.find((c) => c.role === "RESPONSABLE");

  const periods = charges.map((c) => ({
    settlementId: c.settlementId,
    month: c.settlement.month,
    year: c.settlement.year,
    previousBalance: Number(c.previousBalance),
    currentFee: Number(c.currentFee),
    partialPaymentsTotal: Number(c.partialPaymentsTotal),
    totalToPay: Number(c.totalToPay),
    status: c.status,
    payments: payments
      .filter((p) => p.settlementId === c.settlementId)
      .map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        receiptNumber: p.receiptNumber,
        paymentDate: p.paymentDate.toISOString(),
        notes: p.notes,
      })),
  }));

  return NextResponse.json({
    unit: {
      id: unit.id,
      code: unit.code,
      building: unit.building.name,
      responsable: responsable?.fullName ?? null,
    },
    periods,
  });
}
