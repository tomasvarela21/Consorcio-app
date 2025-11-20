import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

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
    return NextResponse.json({ message: "BuildingId inválido" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  const where = {
    buildingId,
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            {
              contacts: {
                some: {
                  role: "RESPONSABLE",
                  fullName: { contains: search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, units] = await Promise.all([
    prisma.unit.count({ where }),
    prisma.unit.findMany({
      where,
      include: { contacts: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { code: "asc" },
    }),
  ]);

  const data = units.map((u) => {
    const responsible = u.contacts.find((c) => c.role === "RESPONSABLE");
    return {
      id: u.id,
      code: u.code,
      percentage: Number(u.percentage),
      accountStatus: u.accountStatus,
      responsible: responsible?.fullName ?? null,
    };
  });

  return NextResponse.json({ total, page, pageSize, data });
}
