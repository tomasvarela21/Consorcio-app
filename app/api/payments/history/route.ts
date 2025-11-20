import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const buildingId = Number(searchParams.get("buildingId"));
  if (!buildingId) {
    return NextResponse.json({ message: "buildingId es requerido" }, { status: 400 });
  }
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const unitCode = searchParams.get("unitCode");
  const responsible = searchParams.get("responsible");

  const payments = await prisma.payment.findMany({
    where: {
      settlement: {
        buildingId,
        ...(month ? { month: Number(month) } : {}),
        ...(year ? { year: Number(year) } : {}),
      },
      unit: { buildingId },
      ...(unitCode
        ? { unit: { code: { contains: unitCode, mode: "insensitive" } } }
        : {}),
    },
    include: {
      settlement: true,
      unit: {
        include: {
          contacts: true,
          building: true,
        },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  const filtered = payments.filter((p) => {
    if (!responsible) return true;
    const resp = p.unit.contacts.find((c) => c.role === "RESPONSABLE");
    return resp?.fullName
      ?.toLowerCase()
      .includes(responsible.toLowerCase());
  });

  return NextResponse.json(
    filtered.map((p) => {
      const resp = p.unit.contacts.find((c) => c.role === "RESPONSABLE");
      return {
        id: p.id,
        amount: Number(p.amount),
        receiptNumber: p.receiptNumber,
        paymentDate: p.paymentDate.toISOString(),
        createdAt: p.createdAt.toISOString(),
        settlement: {
          id: p.settlementId,
          month: p.settlement.month,
          year: p.settlement.year,
        },
        unit: {
          id: p.unitId,
          code: p.unit.code,
          building: p.unit.building.name,
        },
        responsible: resp?.fullName ?? "Sin responsable",
      };
    }),
  );
}
