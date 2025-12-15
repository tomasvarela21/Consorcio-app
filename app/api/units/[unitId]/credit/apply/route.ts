import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { applyAvailableCredit } from "@/lib/credit";
import { prisma } from "@/lib/prisma";
import { roundTwo } from "@/lib/billing";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { unitId: unitParam } = await params;
  const unitId = Number(unitParam);
  if (!unitId) {
    return NextResponse.json({ message: "Unidad inválida" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { settlementId } = body ?? {};
  const referenceDateValue = body?.referenceDate ? new Date(body.referenceDate) : new Date();
  if (Number.isNaN(referenceDateValue.getTime())) {
    return NextResponse.json(
      { message: "Fecha de referencia inválida" },
      { status: 400 },
    );
  }

  try {
    const result = await applyAvailableCredit({ unitId, referenceDate: referenceDateValue });
    let chargePayload: Record<string, unknown> | null = null;
    if (settlementId) {
      const charge = await prisma.settlementCharge.findFirst({
        where: { unitId, settlementId: Number(settlementId) },
        select: {
          id: true,
          unitId: true,
          previousBalance: true,
          currentFee: true,
          partialPaymentsTotal: true,
          totalToPay: true,
          status: true,
        },
      });
      if (charge) {
        chargePayload = {
          id: charge.id,
          unitId: charge.unitId,
          previousBalance: Number(charge.previousBalance ?? 0),
          currentFee: Number(charge.currentFee ?? 0),
          partialPaymentsTotal: Number(charge.partialPaymentsTotal ?? 0),
          totalToPay: Number(charge.totalToPay ?? 0),
          status: charge.status,
          discountApplied: Number(charge.discountApplied ?? 0),
        };
      }
    }

    const appliedToCurrent = settlementId
      ? result.settlementAllocations
          .filter((alloc) => alloc.settlementId === Number(settlementId))
          .reduce((acc, alloc) => acc + alloc.appliedAmount, 0)
      : 0;

    return NextResponse.json({
      summary: {
        appliedToCurrent: roundTwo(appliedToCurrent),
        excedente: 0,
        appliedToMorosos: roundTwo(result.appliedToMorosos),
        appliedToUpcomingSettlements: roundTwo(result.appliedToSettlements),
        upcomingSettlementAllocations: result.settlementAllocations,
        morosoPrevio: 0,
        morosoFinal: 0,
        creditBalance: roundTwo(result.creditBalance),
      },
      charge: chargePayload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo aplicar el saldo a favor";
    return NextResponse.json({ message }, { status: 400 });
  }
}
