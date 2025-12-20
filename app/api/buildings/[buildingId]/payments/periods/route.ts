import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  context: { params: Promise<{ buildingId: string }> },
) {
  const params = await context.params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const buildingId = Number(params.buildingId);
  if (!buildingId) {
    return NextResponse.json(
      { message: "buildingId es requerido" },
      { status: 400 },
    );
  }

  const periods = await prisma.payment.findMany({
    where: {
      settlement: { buildingId },
      status: "COMPLETED",
    },
    distinct: ["settlementId"],
    select: {
      settlementId: true,
      settlement: {
        select: { id: true, month: true, year: true },
      },
    },
  });

  const normalized = periods
    .filter((item) => item.settlement)
    .map((item) => ({
      settlementId: item.settlementId,
      month: item.settlement!.month,
      year: item.settlement!.year,
    }))
    .sort((a, b) => {
      if (a.year === b.year) {
        return b.month - a.month;
      }
      return b.year - a.year;
    });

  return NextResponse.json(normalized);
}
