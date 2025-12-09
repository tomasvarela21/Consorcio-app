import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import {
  calculateEarlyPaymentDiscount,
  getChargePortions,
  getDiscountStats,
  roundTwo,
} from "@/lib/billing";
import {
  applyCreditToUpcomingSettlements,
  applyFundsToMorosos,
  getUnitMorosoSummary,
} from "@/lib/morosos";

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
  const paymentResult = await prisma.$transaction(
    async (tx) => {
    const unitRecord = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unitRecord) {
      throw new Error("Unidad inexistente");
    }
    const creditBalanceBefore = Number(unitRecord.creditBalance ?? 0);
    const morosoBefore = await getUnitMorosoSummary(
      unitId,
      paymentDateValue,
      tx,
    );
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
    const effectiveTotalBefore = Math.max(
      0,
      roundTwo(baseDebt - discountUsed),
    );
    const deudaAntes = Math.max(
      0,
      roundTwo(effectiveTotalBefore - totalPaidBefore),
    );
    const pagoEfectivoLiquidacion = roundTwo(deudaAntes - totalToPay);
    const excedentePagoActual = Math.max(
      0,
      roundTwo(amountNumber - pagoEfectivoLiquidacion),
    );

    let creditPool = roundTwo(creditBalanceBefore + excedentePagoActual);
    let morosoApplication = null;
    let upcomingApplication = null;
    if (creditPool > 0) {
      morosoApplication = await applyFundsToMorosos({
        client: tx,
        unitId,
        referenceDate: paymentDateValue,
        amountFromPayment: 0,
        amountFromCredit: creditPool,
      });
      creditPool = morosoApplication.remainingCredit;
    }
    if (creditPool > 0) {
      upcomingApplication = await applyCreditToUpcomingSettlements({
        client: tx,
        unitId,
        referenceDate: paymentDateValue,
        availableCredit: creditPool,
      });
      creditPool = upcomingApplication.remainingCredit;
    }
    await tx.unit.update({
      where: { id: unitId },
      data: { creditBalance: creditPool },
    });
    const morosoAfter = await getUnitMorosoSummary(
      unitId,
      paymentDateValue,
      tx,
    );

    return {
      payment,
      updatedCharge,
      pagoEfectivoLiquidacion,
      excedentePagoActual,
      morosoBefore,
      morosoAfter,
      morosoApplication,
      upcomingApplication,
      creditBalance: creditPool,
    };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

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
    summary: {
      appliedToCurrent: paymentResult.pagoEfectivoLiquidacion,
      excedente: paymentResult.excedentePagoActual,
      appliedToMorosos: paymentResult.morosoApplication?.totalApplied ?? 0,
      appliedToUpcomingSettlements:
        paymentResult.upcomingApplication?.totalApplied ?? 0,
      upcomingSettlementAllocations:
        paymentResult.upcomingApplication?.allocations ?? [],
      morosoPrevio: paymentResult.morosoBefore.totalMoroso,
      morosoFinal: paymentResult.morosoAfter.totalMoroso,
      creditBalance: paymentResult.creditBalance,
    },
  });
}
