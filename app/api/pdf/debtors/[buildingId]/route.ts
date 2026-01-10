import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { getUnitMorosoSummary } from "@/lib/morosos";
import { formatCurrency } from "@/lib/format";

type Params = {
  buildingId: string;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<Params> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { buildingId: buildingParam } = await params;
  const buildingId = Number(buildingParam);
  if (Number.isNaN(buildingId)) {
    return NextResponse.json({ message: "Edificio inválido" }, { status: 400 });
  }

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
  });
  if (!building) {
    return NextResponse.json({ message: "Edificio no encontrado" }, { status: 404 });
  }

  const today = new Date();

  const candidateUnits = await prisma.settlementCharge.findMany({
    where: {
      settlement: {
        buildingId,
        dueDate2: { not: null, lt: today },
      },
      OR: [
        { totalToPay: { gt: 0 } },
        {
          AND: [
            { lateFeeAmount: { gt: 0 } },
            { status: { not: "PAID" } },
          ],
        },
      ],
    },
    distinct: ["unitId"],
    select: { unitId: true },
  });

  const unitIds = candidateUnits.map((c) => c.unitId);
  if (!unitIds.length) {
    return NextResponse.json(
      { message: "No hay morosos para este edificio" },
      { status: 404 },
    );
  }

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    include: { contacts: true },
  });
  const unitMap = new Map(units.map((u) => [u.id, u]));

  const summaries = await Promise.all(
    unitIds.map((unitId) => getUnitMorosoSummary(unitId, today)),
  );

  const debtors = summaries
    .filter((summary) => summary.totalMoroso > 0)
    .map((summary) => {
      const unit = unitMap.get(summary.unitId);
      const responsable =
        unit?.contacts.find((c) => c.role === "RESPONSABLE")?.fullName ??
        "Sin responsable";
      return {
        unitId: summary.unitId,
        unitCode: unit?.code ?? "",
        responsable,
        totalDebt: summary.totalMoroso,
        periods: summary.bySettlement.map((period) => ({
          settlementId: period.settlementId,
          month: period.month,
          year: period.year,
          basePending: period.deudaOriginalLiquidacionPendiente,
          latePercentage: period.lateFeePercentage,
          monthsLate: period.monthsLate,
          lateAmountPending: period.lateAmountPending,
          totalPending: period.totalMorosoLiquidacionPendiente,
        })),
      };
    })
    .sort((a, b) => a.unitCode.localeCompare(b.unitCode));

  if (!debtors.length) {
    return NextResponse.json(
      { message: "No hay morosos para este edificio" },
      { status: 404 },
    );
  }

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const ensureSpace = (height: number) => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      return true;
    }
    return false;
  };

  const drawHeader = () => {
    doc.font("Helvetica-Bold").fontSize(16).text("Listado de morosos");
    doc.font("Helvetica").fontSize(10).text(building.name);
    if (building.address) {
      doc.text(building.address);
    }
    doc.text(`Fecha de generación: ${today.toLocaleDateString("es-AR")}`);
    doc.moveDown(0.5);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#cbd5f5")
      .lineWidth(1)
      .stroke();
    doc.moveDown();
  };

  const drawDebtor = (debtor: (typeof debtors)[number]) => {
    ensureSpace(80);
    doc.font("Helvetica-Bold").fontSize(12).text(`${debtor.unitCode} - ${debtor.responsable}`);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`Total deuda: ${formatCurrency(debtor.totalDebt)}`);
    doc.moveDown(0.3);

    const columns = [
      { title: "Periodo", width: 60 },
      { title: "Saldo original", width: 85 },
      { title: "% recargo", width: 70 },
      { title: "Recargo 1 mes", width: 85 },
      { title: "Meses adeud.", width: 70 },
      { title: "Total recargo", width: 75 },
      { title: "Total deuda", width: 70 },
    ];

    const startX = doc.page.margins.left;
    const drawTableHeader = (y: number) => {
      let currentX = startX;
      doc.font("Helvetica-Bold").fontSize(9);
      columns.forEach((col) => {
        doc.text(col.title, currentX, y, { width: col.width });
        currentX += col.width;
      });

      doc.moveTo(startX, y + 12)
        .lineTo(startX + columns.reduce((acc, col) => acc + col.width, 0), y + 12)
        .strokeColor("#e2e8f0")
        .lineWidth(1)
        .stroke();
      doc.font("Helvetica").fontSize(9);
      return y + 16;
    };

    let rowY = drawTableHeader(doc.y);

    debtor.periods.forEach((period) => {
      if (ensureSpace(18)) {
        rowY = drawTableHeader(doc.y);
      }
      const monthlyLate = period.basePending * (period.latePercentage / 100);
      const totalLate = monthlyLate * period.monthsLate;
      const data = [
        `${String(period.month).padStart(2, "0")}/${period.year}`,
        formatCurrency(period.basePending),
        `${period.latePercentage}%`,
        formatCurrency(monthlyLate),
        `${period.monthsLate}`,
        formatCurrency(totalLate),
        formatCurrency(period.basePending + totalLate),
      ];
      let x = startX;
      data.forEach((value, idx) => {
        doc.text(value, x, rowY, {
          width: columns[idx].width,
          continued: false,
        });
        x += columns[idx].width;
      });
      rowY += 16;
    });

    ensureSpace(24);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Total deuda unidad: ${formatCurrency(debtor.totalDebt)}`, startX, rowY + 4);
    doc.moveDown(1);
  };

  drawHeader();
  debtors.forEach(drawDebtor);

  doc.end();

  const pdfBuffer: Buffer = await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const filename = `Listado Morosos (${formatDate(today)})`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
