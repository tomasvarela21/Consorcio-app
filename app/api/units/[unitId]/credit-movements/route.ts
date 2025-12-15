import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET(
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

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true, creditBalance: true },
  });
  if (!unit) {
    return NextResponse.json({ message: "Unidad no encontrada" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 25;

  const movements = await prisma.creditMovement.findMany({
    where: { unitId },
    orderBy: { movementDate: "desc" },
    include: {
      settlement: true,
      payment: {
        include: {
          settlement: true,
        },
      },
    },
    take: limit,
  });

  return NextResponse.json({
    balance: Number(unit.creditBalance ?? 0),
    movements: movements.map((movement) => ({
      id: movement.id,
      type: movement.movementType,
      amount: Number(movement.amount),
      description: movement.description,
      createdAt: movement.movementDate.toISOString(),
      payment: movement.payment
        ? {
            id: movement.payment.id,
            receiptNumber: movement.payment.receiptNumber,
            settlementId: movement.payment.settlementId,
            settlementMonth: movement.payment.settlement?.month ?? null,
            settlementYear: movement.payment.settlement?.year ?? null,
          }
        : null,
      settlement: movement.settlement
        ? {
            id: movement.settlement.id,
            month: movement.settlement.month,
            year: movement.settlement.year,
          }
        : null,
    })),
  });
}
