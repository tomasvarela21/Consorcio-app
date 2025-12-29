import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { roundTwo } from "@/lib/billing";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { paymentId } = await params;
  const id = Number(paymentId);
  if (!id) {
    return NextResponse.json({ message: "Pago inválido" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      creditMovements: {
        where: {
          movementType: "DEBIT",
          paymentId: id,
        },
        select: { id: true, amount: true },
      },
    },
  });
  if (!payment) {
    return NextResponse.json({ message: "Pago no encontrado" }, { status: 404 });
  }
  if (payment.status === "CANCELLED") {
    return NextResponse.json(
      { message: "El pago ya fue anulado" },
      { status: 400 },
    );
  }

  const charge = await prisma.settlementCharge.findFirst({
    where: { settlementId: payment.settlementId, unitId: payment.unitId },
  });
  if (!charge) {
    return NextResponse.json(
      { message: "No se encontró el cargo asociado al pago" },
      { status: 404 },
    );
  }

  const amountNumber = Number(payment.amount);
  const existingPartial = Number(charge.partialPaymentsTotal ?? 0);

  const result = await prisma.$transaction(async (tx) => {
    const discountAggregate = await tx.payment.aggregate({
      where: {
        settlementId: payment.settlementId,
        unitId: payment.unitId,
        status: "COMPLETED",
      },
      _sum: { discountApplied: true },
    });
    const discountSumBefore = Number(discountAggregate._sum.discountApplied ?? 0);
    const discountAfter = roundTwo(
      Math.max(
        0,
        discountSumBefore - Number(payment.discountApplied ?? 0),
      ),
    );
    const newPartial = roundTwo(Math.max(0, existingPartial - amountNumber));
    const baseDebt =
      Number(charge.previousBalance ?? 0) + Number(charge.currentFee ?? 0);
    const effectiveTotal = Math.max(0, roundTwo(baseDebt - discountAfter));
    const totalToPay = Math.max(0, roundTwo(effectiveTotal - newPartial));
    const status =
      totalToPay <= 0 ? "PAID" : newPartial > 0 ? "PARTIAL" : "PENDING";

    const updatedPayment = await tx.payment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        canceledAt: new Date(),
      },
    });

    let creditReversal = 0;
    if (payment.creditMovements.length > 0) {
      const debitIds = payment.creditMovements.map((movement) => movement.id);
      creditReversal = roundTwo(
        payment.creditMovements.reduce(
          (total, movement) => total + Number(movement.amount),
          0,
        ),
      );
      if (creditReversal > 0) {
        await tx.creditMovement.create({
          data: {
            unitId: payment.unitId,
            paymentId: payment.id,
            settlementId: payment.settlementId,
            amount: creditReversal,
            movementType: "CREDIT",
            description: `Reintegro saldo a favor por anulación de pago ${payment.receiptNumber}`,
          },
        });
      }
      if (debitIds.length) {
        await tx.creditMovement.deleteMany({
          where: { id: { in: debitIds } },
        });
      }
      if (creditReversal > 0) {
        const unitRecord = await tx.unit.findUnique({
          where: { id: payment.unitId },
          select: { creditBalance: true },
        });
        const balanceBefore = Number(unitRecord?.creditBalance ?? 0);
        await tx.unit.update({
          where: { id: payment.unitId },
          data: { creditBalance: roundTwo(balanceBefore + creditReversal) },
        });
      }
    }

    const updatedCharge = await tx.settlementCharge.update({
      where: { id: charge.id },
      data: {
        partialPaymentsTotal: newPartial,
        totalToPay,
        status,
      },
    });

    return { updatedPayment, updatedCharge };
  });

  return NextResponse.json({
    payment: {
      ...result.updatedPayment,
      amount: Number(result.updatedPayment.amount),
      paymentDate: result.updatedPayment.paymentDate.toISOString(),
      createdAt: result.updatedPayment.createdAt.toISOString(),
      canceledAt: result.updatedPayment.canceledAt
        ? result.updatedPayment.canceledAt.toISOString()
        : null,
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
