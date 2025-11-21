import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import type { ContactRole } from "@prisma/client";

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
    percentage: Number(unit.percentage),
    accountStatus: unit.accountStatus,
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

  if (!code || !percentage) {
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

  await prisma.$transaction([
    prisma.unit.update({
      where: { id: unitId },
      data: { code, percentage },
    }),
    prisma.contact.deleteMany({ where: { unitId } }),
    prisma.contact.createMany({ data: newContacts }),
  ]);

  return NextResponse.json({ ok: true });
}
