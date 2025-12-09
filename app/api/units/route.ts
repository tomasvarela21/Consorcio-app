import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import type { ContactRole } from "@prisma/client";
import { Prisma } from "@prisma/client";

type ContactPayload = {
  fullName?: string;
  dni?: string;
  phone?: string;
  address?: string;
};

const PADRON_REGEX = /^[a-zA-Z0-9-]+$/;
const COVERAGE_LIMIT = 100;
const COVERAGE_EPSILON = 0.0001;

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { buildingId, code, percentage, contacts = {} } = body;
  const buildingIdNumber = Number(buildingId);
  const percentageValue = Number(percentage);
  const rawPadron: string =
    typeof body.padron === "string" ? body.padron.trim() : "";

  if (!buildingIdNumber || !code || Number.isNaN(percentageValue)) {
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

  if (rawPadron && !PADRON_REGEX.test(rawPadron)) {
    return NextResponse.json(
      { message: "El padrón solo puede contener letras, números o guiones" },
      { status: 400 },
    );
  }

  const coverageResult = await prisma.unit.aggregate({
    where: { buildingId: buildingIdNumber },
    _sum: { percentage: true },
  });
  const currentCoverage = Number(coverageResult._sum.percentage ?? 0);
  if (currentCoverage + percentageValue > COVERAGE_LIMIT + COVERAGE_EPSILON) {
    return NextResponse.json(
      { message: "La suma de porcentajes superaría el 100%. Ajusta otras unidades antes de continuar." },
      { status: 400 },
    );
  }

  if (rawPadron) {
    const exists = await prisma.unit.findFirst({
      where: { padron: rawPadron },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json(
        { message: "Ese padrón ya está asociado a otra unidad" },
        { status: 409 },
      );
    }
  }

  try {
    const unit = await prisma.unit.create({
      data: {
        buildingId: buildingIdNumber,
        code,
        percentage: percentageValue,
        padron: rawPadron || null,
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
