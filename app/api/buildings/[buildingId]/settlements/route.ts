import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { roundTwo } from "@/lib/billing";

export async function GET(
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

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  if (month && year) {
    const settlement = await prisma.settlement.findFirst({
      where: { buildingId, month: Number(month), year: Number(year) },
      include: {
        charges: {
          include: { unit: { include: { contacts: true } } },
        },
      },
    });
    if (!settlement) {
      return NextResponse.json({ settlement: null, charges: [] });
    }
    const charges = settlement.charges.map((c) => {
      const responsable = c.unit.contacts.find((ct) => ct.role === "RESPONSABLE");
      return {
        id: c.id,
        unitId: c.unitId,
        unitCode: c.unit.code,
        responsable: responsable?.fullName ?? "Sin responsable",
        previousBalance: Number(c.previousBalance),
        currentFee: Number(c.currentFee),
        partialPaymentsTotal: Number(c.partialPaymentsTotal),
        totalToPay: Number(c.totalToPay),
        status: c.status,
      };
    });
    return NextResponse.json({
      settlement: {
        id: settlement.id,
        month: settlement.month,
        year: settlement.year,
        totalExpense: Number(settlement.totalExpense),
        dueDate1: settlement.dueDate1?.toISOString() ?? null,
        dueDate2: settlement.dueDate2?.toISOString() ?? null,
      },
      charges,
    });
  }

  const settlements = await prisma.settlement.findMany({
    where: { buildingId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return NextResponse.json(
    settlements.map((s) => ({
      id: s.id,
      month: s.month,
      year: s.year,
      totalExpense: Number(s.totalExpense),
      dueDate1: s.dueDate1?.toISOString() ?? null,
      dueDate2: s.dueDate2?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  );
}

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

  const body = await req.json().catch(() => ({}));
  const { month, year, totalExpense, dueDate1, dueDate2 } = body;
  if (!month || !year || !totalExpense) {
    return NextResponse.json(
      { message: "Mes, año y gasto total son obligatorios" },
      { status: 400 },
    );
  }

  const units = await prisma.unit.findMany({ where: { buildingId } });
  if (!units.length) {
    return NextResponse.json(
      { message: "No hay unidades registradas para este edificio" },
      { status: 400 },
    );
  }

  const settlement = await prisma.settlement.create({
    data: {
      buildingId,
      month,
      year,
      totalExpense,
      dueDate1: dueDate1 ? new Date(dueDate1) : null,
      dueDate2: dueDate2 ? new Date(dueDate2) : null,
    },
  });

  const chargesData = units.map((unit) => {
    const currentFee = roundTwo(Number(totalExpense) * Number(unit.percentage) * 0.01);
    const previousBalance = 0;
    const totalToPay = roundTwo(previousBalance + currentFee);
    return {
      settlementId: settlement.id,
      unitId: unit.id,
      previousBalance,
      currentFee,
      partialPaymentsTotal: 0,
      totalToPay,
      status: "PENDING",
    };
  });

  await prisma.settlementCharge.createMany({ data: chargesData });

  return NextResponse.json({ settlementId: settlement.id });
}
