// app/api/buildings/[buildingId]/residents/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { compareUnitCodes } from "@/lib/sort";

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
        padron: {
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

  const [total, unitsRaw, percentageAgg] = await Promise.all([
    prisma.unit.count({ where }),
    prisma.unit.findMany({
      where,
      include: { contacts: true },
    }),
    prisma.unit.aggregate({
      where: { buildingId },
      _sum: { percentage: true },
    }),
  ]);

  const orderedUnits = [...unitsRaw].sort((a, b) => compareUnitCodes(a.code, b.code));
  const paginatedUnits = orderedUnits.slice(skip, skip + pageSize);

  const unitIds = paginatedUnits.map((u) => u.id);
  let overdueUnits = new Set<number>();
  if (unitIds.length > 0) {
    const today = new Date();
    const overdueCharges = await prisma.settlementCharge.findMany({
      where: {
        unitId: { in: unitIds },
        totalToPay: { gt: 0 },
        settlement: {
          dueDate2: { lt: today },
          NOT: { dueDate2: null },
        },
      },
      select: { unitId: true },
    });
    overdueUnits = new Set(overdueCharges.map((c) => c.unitId));
  }

  const data = paginatedUnits.map((u) => {
    const responsible = u.contacts.find((c) => c.role === "RESPONSABLE");
    const hasDebt = overdueUnits.has(u.id);
    return {
      id: u.id,
      code: u.code,
      padron: u.padron,
      percentage: Number(u.percentage),
      accountStatus: hasDebt ? "WITH_DEBT" : "ON_TIME",
      responsible: responsible?.fullName ?? null,
    };
  });

  return NextResponse.json({
    total,
    page,
    pageSize,
    data,
    percentageSum: Number(percentageAgg._sum.percentage ?? 0),
  });
}
