import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import {
  applyCreditToUpcomingSettlements,
  applyFundsToMorosos,
  getUnitMorosoSummary,
} from "@/lib/morosos";
import { roundTwo } from "@/lib/billing";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }
  const { buildingId: buildingParam } = await params;
  const buildingId = Number(buildingParam);
  if (!buildingId) {
    return NextResponse.json({ message: "Edificio inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { unitId, amount, receiptNumber, paymentDate, notes } = body;
  if (!unitId || !amount || !receiptNumber) {
    return NextResponse.json(
      { message: "Unidad, monto y recibo son obligatorios" },
      { status: 400 },
    );
  }
  const unitIdNumber = Number(unitId);
  const amountNumber = roundTwo(Number(amount));
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return NextResponse.json(
      { message: "El monto debe ser mayor a cero" },
      { status: 400 },
    );
  }
  const paymentDateValue = paymentDate ? new Date(paymentDate) : new Date();
  if (Number.isNaN(paymentDateValue.getTime())) {
    return NextResponse.json(
      { message: "Fecha de pago inválida" },
      { status: 400 },
    );
  }

  const unit = await prisma.unit.findUnique({ where: { id: unitIdNumber } });
  if (!unit || unit.buildingId !== buildingId) {
    return NextResponse.json(
      { message: "La unidad no pertenece a este edificio" },
      { status: 404 },
    );
  }

  try {
    const summaryBefore = await getUnitMorosoSummary(
      unitIdNumber,
      paymentDateValue,
    );

    const result = await prisma.$transaction(async (tx) => {
      const unitRecord = await tx.unit.findUnique({ where: { id: unitIdNumber } });
      if (!unitRecord) {
        throw new Error("Unidad inexistente");
      }
      const creditBalance = Number(unitRecord.creditBalance ?? 0);
      const totalAvailable = roundTwo(creditBalance + amountNumber);
      if (totalAvailable <= 0) {
        throw new Error("No hay fondos disponibles para aplicar");
      }
      const application = await applyFundsToMorosos({
        client: tx,
        unitId: unitIdNumber,
        referenceDate: paymentDateValue,
        amountFromPayment: amountNumber,
        amountFromCredit: creditBalance,
        paymentDate: paymentDateValue,
        receiptNumber,
        notes,
      });
      let creditPool = roundTwo(application.remainingFromCredit);
      if (application.remainingFromPayment > 0) {
        await tx.creditMovement.create({
          data: {
            unitId: unitIdNumber,
            paymentId: null,
            settlementId: null,
            settlementChargeId: null,
            amount: application.remainingFromPayment,
            movementType: "CREDIT",
            description: `Excedente pago morosos - Recibo ${receiptNumber}`,
          },
        });
        creditPool = roundTwo(creditPool + application.remainingFromPayment);
      }
      const futureSettlements = await applyCreditToUpcomingSettlements({
        client: tx,
        unitId: unitIdNumber,
        referenceDate: paymentDateValue,
        availableCredit: creditPool,
      });
      await tx.unit.update({
        where: { id: unitIdNumber },
        data: { creditBalance: futureSettlements.remainingCredit },
      });
      return { application, futureSettlements };
    });

    const summaryAfter = await getUnitMorosoSummary(
      unitIdNumber,
      paymentDateValue,
    );

    return NextResponse.json({
      amount: amountNumber,
      morosoPrevio: summaryBefore.totalMoroso,
      morosoFinal: summaryAfter.totalMoroso,
      appliedToMorosos: result.application.totalApplied,
      appliedFromPayment: result.application.totalAppliedFromPayment,
      appliedFromCredit: result.application.totalAppliedFromCredit,
      appliedToUpcomingSettlements: result.futureSettlements.totalApplied,
      upcomingSettlementAllocations: result.futureSettlements.allocations,
      creditBalance: result.futureSettlements.remainingCredit,
      allocations: result.application.allocations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al aplicar pago";
    return NextResponse.json({ message }, { status: 400 });
  }
}
