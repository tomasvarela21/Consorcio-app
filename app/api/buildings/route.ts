import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

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
