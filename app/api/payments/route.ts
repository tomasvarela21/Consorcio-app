import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { roundTwo } from "@/lib/billing";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { settlementId, unitId, amount, receiptNumber, paymentDate, notes } = body;
  if (!settlementId || !unitId || !amount || !receiptNumber) {
    return NextResponse.json(
      { message: "Faltan datos obligatorios del pago" },
      { status: 400 },
    );
  }

  const [charge, settlement, unit] = await Promise.all([
    prisma.settlementCharge.findFirst({
      where: { settlementId, unitId },
    }),
    prisma.settlement.findUnique({ where: { id: settlementId } }),
    prisma.unit.findUnique({ where: { id: unitId } }),
  ]);
  if (!charge || !settlement || !unit) {
    return NextResponse.json({ message: "No existe el cargo para esa unidad" }, { status: 404 });
  }
  if (unit.buildingId !== settlement.buildingId) {
    return NextResponse.json({ message: "La unidad y la liquidación no pertenecen al mismo edificio" }, { status: 400 });
  }

  const amountNumber = Number(amount);
  const paymentDateValue = paymentDate ? new Date(paymentDate) : new Date();
  const existingTotal = Number(charge.partialPaymentsTotal);
  const newPartial = roundTwo(existingTotal + amountNumber);
  const totalToPay = roundTwo(Number(charge.previousBalance) + Number(charge.currentFee) - newPartial);
  const status =
    totalToPay <= 0 ? "PAID" : newPartial > 0 ? "PARTIAL" : "PENDING";

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        settlementId,
        unitId,
        amount: amountNumber,
        receiptNumber,
        paymentDate: paymentDateValue,
        notes,
      },
    });

    const updatedCharge = await tx.settlementCharge.update({
      where: { id: charge.id },
      data: {
        partialPaymentsTotal: newPartial,
        totalToPay,
        status,
      },
    });

    return { payment, updatedCharge };
  });

  return NextResponse.json({
    payment: {
      ...result.payment,
      amount: Number(result.payment.amount),
      paymentDate: result.payment.paymentDate.toISOString(),
      createdAt: result.payment.createdAt.toISOString(),
    },
    charge: {
      ...result.updatedCharge,
      previousBalance: Number(result.updatedCharge.previousBalance),
      currentFee: Number(result.updatedCharge.currentFee),
      partialPaymentsTotal: Number(result.updatedCharge.partialPaymentsTotal),
      totalToPay: Number(result.updatedCharge.totalToPay),
    },
  });
}
