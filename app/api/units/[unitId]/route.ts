import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import type { ContactRole } from "@prisma/client";
import { Prisma } from "@prisma/client";

const PADRON_REGEX = /^[a-zA-Z0-9-]+$/;
const COVERAGE_LIMIT = 100;
const COVERAGE_EPSILON = 0.0001;

export async function GET(
  _req: Request,
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
    include: { contacts: true },
  });
  if (!unit) {
    return NextResponse.json({ message: "No encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    id: unit.id,
    code: unit.code,
    padron: unit.padron,
    percentage: Number(unit.percentage),
    accountStatus: unit.accountStatus,
    creditBalance: Number(unit.creditBalance ?? 0),
    contacts: unit.contacts.map((c) => ({
      id: c.id,
      role: c.role,
      fullName: c.fullName,
      dni: c.dni,
      phone: c.phone,
      address: c.address,
    })),
  });
}

export async function PATCH(
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
  const { code, percentage, contacts = {} } = body;
  const percentageValue = Number(percentage);
  const rawPadron: string =
    typeof body.padron === "string" ? body.padron.trim() : "";

  if (!code || Number.isNaN(percentageValue)) {
    return NextResponse.json(
      { message: "Unidad y porcentaje son obligatorios" },
      { status: 400 },
    );
  }

  const responsable = contacts.responsable as { fullName?: string; phone?: string } | undefined;
  if (!responsable?.fullName || !responsable?.phone) {
    return NextResponse.json(
      { message: "El responsable de pago necesita nombre y celular" },
      { status: 400 },
    );
  }

  const existingUnit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { percentage: true, buildingId: true },
  });
  if (!existingUnit) {
    return NextResponse.json({ message: "No encontrado" }, { status: 404 });
  }

  if (rawPadron && !PADRON_REGEX.test(rawPadron)) {
    return NextResponse.json(
      { message: "El padrón solo puede contener letras, números o guiones" },
      { status: 400 },
    );
  }

  if (rawPadron) {
    const exists = await prisma.unit.findFirst({
      where: {
        padron: rawPadron,
        id: { not: unitId },
      },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json(
        { message: "Ese padrón ya está asociado a otra unidad" },
        { status: 409 },
      );
    }
  }

  const coverageResult = await prisma.unit.aggregate({
    where: { buildingId: existingUnit.buildingId },
    _sum: { percentage: true },
  });
  const currentCoverage = Number(coverageResult._sum.percentage ?? 0);
  const previousPercentage = Number(existingUnit.percentage);
  const updatedCoverage = currentCoverage - previousPercentage + percentageValue;
  if (updatedCoverage > COVERAGE_LIMIT + COVERAGE_EPSILON) {
    return NextResponse.json(
      { message: "La suma de porcentajes superaría el 100%. Ajusta otras unidades antes de continuar." },
      { status: 400 },
    );
  }

  const toContact = (
    role: ContactRole,
    data?: { fullName?: string; dni?: string; phone?: string; address?: string },
  ) =>
    data?.fullName
      ? {
          role,
          fullName: data.fullName,
          dni: data.dni,
          phone: data.phone,
          address: data.address,
          unitId,
        }
      : null;

  const newContacts = [
    toContact("INQUILINO", contacts.inquilino),
    toContact("RESPONSABLE", contacts.responsable),
    toContact("PROPIETARIO", contacts.propietario),
    toContact("INMOBILIARIA", contacts.inmobiliaria),
  ].filter(Boolean) as Array<{
    role: ContactRole;
    fullName: string;
    dni?: string;
    phone?: string;
    address?: string;
    unitId: number;
  }>;

  try {
    await prisma.$transaction([
      prisma.unit.update({
        where: { id: unitId },
        data: { code, percentage: percentageValue, padron: rawPadron || null },
      }),
      prisma.contact.deleteMany({ where: { unitId } }),
      prisma.contact.createMany({ data: newContacts }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { message: "Ese padrón ya está asociado a otra unidad" },
        { status: 409 },
      );
    }
    throw error;
  }
}
