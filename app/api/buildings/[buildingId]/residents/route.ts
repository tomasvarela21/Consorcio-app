// app/api/buildings/[buildingId]/residents/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { Prisma } from "@prisma/client";

type Params = {
  buildingId: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
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
  const skip = (page - 1) * pageSize;

  const where: Prisma.UnitWhereInput = {
    buildingId,
  };

  if (search.trim().length > 0) {
    where.OR = [
      {
        code: {
          contains: search,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        contacts: {
          some: {
            role: "RESPONSABLE",
            fullName: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      },
    ];
  }

  const [total, units] = await Promise.all([
    prisma.unit.count({ where }),
    prisma.unit.findMany({
      where,
      include: { contacts: true },
      skip,
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
      accountStatus: u.accountStatus ?? "ON_TIME",
      responsible: responsible?.fullName ?? null,
    };
  });

  return NextResponse.json({
    total,
    page,
    pageSize,
    data,
  });
}
