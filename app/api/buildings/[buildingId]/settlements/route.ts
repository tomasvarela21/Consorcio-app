import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { roundTwo } from "@/lib/billing";
import { ChargeStatus, Prisma } from "@prisma/client";
import { compare } from "bcryptjs";

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
    const coverage = settlement.charges.reduce(
      (acc, charge) => acc + Number(charge.unit.percentage ?? 0),
      0,
    );
    const uncoveredAmount = Math.max(
      0,
      Number(settlement.totalExpense) * (1 - coverage / 100),
    );
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
        lateFeePercentage: Number(settlement.lateFeePercentage),
        percentageCoverage: coverage,
        uncoveredAmount,
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
      lateFeePercentage: Number(s.lateFeePercentage),
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
  const { month, year, totalExpense, dueDate1, dueDate2, lateFeePercentage } = body;
  if (!month || !year || !totalExpense) {
    return NextResponse.json(
      { message: "Mes, año y gasto total son obligatorios" },
      { status: 400 },
    );
  }

  const lateFee = lateFeePercentage !== undefined ? Number(lateFeePercentage) : 10;
  if (Number.isNaN(lateFee) || lateFee < 0) {
    return NextResponse.json(
      { message: "El recargo debe ser un número positivo" },
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
      lateFeePercentage: lateFee,
    },
  });

  const totalExpenseNumber = Number(totalExpense);
  const chargesData: Prisma.SettlementChargeCreateManyInput[] = units.map(
    (unit) => {
      const percentageValue = Number(unit.percentage);
      const currentFee = roundTwo(
        totalExpenseNumber * (percentageValue / 100),
      );
      const previousBalance = 0;
      const totalToPay = roundTwo(previousBalance + currentFee);
      return {
        settlementId: settlement.id,
        unitId: unit.id,
        previousBalance,
        currentFee,
        partialPaymentsTotal: 0,
        totalToPay,
        status: ChargeStatus.PENDING,
      };
    },
  );

  await prisma.settlementCharge.createMany({ data: chargesData });

  return NextResponse.json({ settlementId: settlement.id });
}

export async function DELETE(
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

  const { settlementId, password } = await req.json().catch(() => ({}));
  if (!settlementId || !password) {
    return NextResponse.json(
      { message: "Liquidación y contraseña son obligatorias" },
      { status: 400 },
    );
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: session.id } });
  if (!admin) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }
  const validPassword = await compare(password, admin.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ message: "Contraseña incorrecta" }, { status: 401 });
  }

  const settlement = await prisma.settlement.findFirst({
    where: { id: Number(settlementId), buildingId },
    include: { payments: true },
  });
  if (!settlement) {
    return NextResponse.json({ message: "Liquidación no encontrada" }, { status: 404 });
  }
  if (settlement.payments.some((p) => p.status === "COMPLETED")) {
    return NextResponse.json(
      { message: "No se puede eliminar una liquidación con pagos registrados" },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.payment.deleteMany({
      where: { settlementId: settlement.id },
    }),
    prisma.settlementCharge.deleteMany({ where: { settlementId: settlement.id } }),
    prisma.settlement.delete({ where: { id: settlement.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
