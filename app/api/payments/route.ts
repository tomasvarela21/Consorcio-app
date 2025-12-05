import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import {
  calculateEarlyPaymentDiscount,
  getChargePortions,
  getDiscountStats,
  roundTwo,
} from "@/lib/billing";

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

  const amountNumber = roundTwo(Number(amount));
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return NextResponse.json(
      { message: "El monto del pago debe ser mayor a cero" },
      { status: 400 },
    );
  }
  const paymentDateValue = paymentDate ? new Date(paymentDate) : new Date();
  const paymentResult = await prisma.$transaction(async (tx) => {
    const discountAggregate = await tx.payment.aggregate({
      where: { settlementId, unitId, status: "COMPLETED" },
      _sum: { discountApplied: true },
    });
    const discountUsed = Number(discountAggregate._sum.discountApplied ?? 0);
    const totalPaidBefore = Number(charge.partialPaymentsTotal ?? 0);
    const currentFee = Number(charge.currentFee ?? 0);
    const previousBalance = Number(charge.previousBalance ?? 0);
    const { previousOutstanding, currentOutstandingNominal } =
      getChargePortions({
        previousBalance,
        currentFee,
        partialPaymentsTotal: totalPaidBefore,
        discountApplied: discountUsed,
      });
    const amountForPrevious = Math.min(amountNumber, previousOutstanding);
    const amountForCurrent = roundTwo(
      Math.max(0, amountNumber - amountForPrevious),
    );
    const discountStats = getDiscountStats(currentFee, discountUsed);
    const discountAppliedNow = calculateEarlyPaymentDiscount({
      amountForCurrent,
      paymentDate: paymentDateValue,
      firstDueDate: settlement.dueDate1,
      currentOutstandingNominal,
      discountRemaining: discountStats.remaining,
    });
    const newPartial = roundTwo(totalPaidBefore + amountNumber);
    const totalDiscount = roundTwo(discountUsed + discountAppliedNow);
    const baseDebt = roundTwo(previousBalance + currentFee);
    const effectiveTotal = Math.max(0, roundTwo(baseDebt - totalDiscount));
    const totalToPay = Math.max(0, roundTwo(effectiveTotal - newPartial));
    const status =
      totalToPay <= 0 ? "PAID" : newPartial > 0 ? "PARTIAL" : "PENDING";

    const payment = await tx.payment.create({
      data: {
        settlementId,
        unitId,
        amount: amountNumber,
        receiptNumber,
        paymentDate: paymentDateValue,
        notes,
        status: "COMPLETED",
        discountApplied: discountAppliedNow,
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
      ...paymentResult.payment,
      amount: Number(paymentResult.payment.amount),
      paymentDate: paymentResult.payment.paymentDate.toISOString(),
      createdAt: paymentResult.payment.createdAt.toISOString(),
      canceledAt: paymentResult.payment.canceledAt
        ? paymentResult.payment.canceledAt.toISOString()
        : null,
    },
    charge: {
      ...paymentResult.updatedCharge,
      previousBalance: Number(paymentResult.updatedCharge.previousBalance),
      currentFee: Number(paymentResult.updatedCharge.currentFee),
      partialPaymentsTotal: Number(paymentResult.updatedCharge.partialPaymentsTotal),
      totalToPay: Number(paymentResult.updatedCharge.totalToPay),
    },
  });
}
