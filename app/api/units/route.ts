import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import type { ContactRole } from "@prisma/client";

type ContactPayload = {
  fullName?: string;
  dni?: string;
  phone?: string;
  address?: string;
};

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { buildingId, code, percentage, contacts = {} } = body;

  if (!buildingId || !code || !percentage) {
    return NextResponse.json(
      { message: "Unidad, porcentaje y edificio son obligatorios" },
      { status: 400 },
    );
  }

  const responsable: ContactPayload | undefined = contacts.responsable;
  if (!responsable?.fullName || !responsable?.phone) {
    return NextResponse.json(
      { message: "El responsable de pago necesita nombre y celular" },
      { status: 400 },
    );
  }

  const unit = await prisma.unit.create({
    data: {
      buildingId,
      code,
      percentage,
      accountStatus: "ON_TIME",
    },
  });

  const payloads: Array<{
    role: ContactRole;
    fullName: string;
    dni?: string;
    phone?: string;
    address?: string;
    unitId: number;
  }> = [];

  const pushIfPresent = (role: ContactRole, data?: ContactPayload) => {
    if (data?.fullName) {
      payloads.push({
        role,
        fullName: data.fullName,
        dni: data.dni,
        phone: data.phone,
        address: data.address,
        unitId: unit.id,
      });
    }
  };

  pushIfPresent("INQUILINO", contacts.inquilino);
  pushIfPresent("RESPONSABLE", contacts.responsable);
  pushIfPresent("PROPIETARIO", contacts.propietario);
  pushIfPresent("INMOBILIARIA", contacts.inmobiliaria);

  if (payloads.length) {
    await prisma.contact.createMany({ data: payloads });
  }

  return NextResponse.json({ unitId: unit.id });
}
