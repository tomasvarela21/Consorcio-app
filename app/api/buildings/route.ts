import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { compare } from "bcryptjs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const buildings = await prisma.building.findMany({
    include: {
      _count: { select: { units: true, settlements: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    buildings.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { name, address } = await req.json().catch(() => ({}));
  if (!name || !address) {
    return NextResponse.json(
      { message: "Nombre y dirección son obligatorios" },
      { status: 400 },
    );
  }

  const building = await prisma.building.create({
    data: { name, address },
  });

  return NextResponse.json({
    ...building,
    createdAt: building.createdAt.toISOString(),
  });
}

export async function DELETE(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { buildingId, password } = await req.json().catch(() => ({}));
  if (!buildingId || !password) {
    return NextResponse.json(
      { message: "Edificio y contraseña son obligatorios" },
      { status: 400 },
    );
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: session.id } });
  if (!admin) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const isValidPassword = await compare(password, admin.passwordHash);
  if (!isValidPassword) {
    return NextResponse.json({ message: "Contraseña incorrecta" }, { status: 401 });
  }

  const buildingIdNumber = Number(buildingId);
  if (!buildingIdNumber) {
    return NextResponse.json({ message: "Edificio inválido" }, { status: 400 });
  }

  const existing = await prisma.building.findUnique({ where: { id: buildingIdNumber } });
  if (!existing) {
    return NextResponse.json({ message: "Edificio no encontrado" }, { status: 404 });
  }

  const units = await prisma.unit.findMany({
    where: { buildingId: buildingIdNumber },
    select: { id: true },
  });
  const unitIds = units.map((u) => u.id);

  await prisma.$transaction([
    prisma.creditMovement.deleteMany({ where: { unitId: { in: unitIds } } }),
    prisma.payment.deleteMany({ where: { unitId: { in: unitIds } } }),
    prisma.settlementCharge.deleteMany({ where: { unitId: { in: unitIds } } }),
    prisma.contact.deleteMany({ where: { unitId: { in: unitIds } } }),
    prisma.unit.deleteMany({ where: { buildingId: buildingIdNumber } }),
    prisma.settlement.deleteMany({ where: { buildingId: buildingIdNumber } }),
    prisma.building.delete({ where: { id: buildingIdNumber } }),
  ]);
  return NextResponse.json({ ok: true });
}
