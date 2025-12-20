import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";

type PdfPayment = {
  id: number;
  amount: number;
  receiptNumber: string;
  paymentDate: Date;
  unitCode: string;
  responsible: string;
};

const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long" });

function getPeriodLabel(month: number, year: number) {
  const reference = new Date(year, month - 1, 1);
  const monthName = monthFormatter.format(reference);
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(
    1,
  )} ${year}`;
}

export async function GET(
  req: Request,
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

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));

  if (!month || !year) {
    return NextResponse.json(
      { message: "Periodo inválido" },
      { status: 400 },
    );
  }

  const [building, payments] = await Promise.all([
    prisma.building.findUnique({
      where: { id: buildingId },
      select: { name: true, address: true },
    }),
    prisma.payment.findMany({
      where: {
        settlement: { buildingId, month, year },
        status: "COMPLETED",
      },
      include: {
        unit: {
          select: {
            code: true,
            contacts: true,
          },
        },
      },
      orderBy: { paymentDate: "desc" },
    }),
  ]);

  if (!building) {
    return NextResponse.json(
      { message: "Edificio no encontrado" },
      { status: 404 },
    );
  }

  if (payments.length === 0) {
    return NextResponse.json(
      { message: "No hay pagos confirmados para este período" },
      { status: 404 },
    );
  }

  const pdfPayments: PdfPayment[] = payments.map((payment) => ({
    id: payment.id,
    amount: Number(payment.amount),
    receiptNumber: payment.receiptNumber,
    paymentDate: payment.paymentDate,
    unitCode: payment.unit.code ?? "Sin código",
    responsible:
      payment.unit.contacts.find((c) => c.role === "RESPONSABLE")?.fullName ??
      "Sin responsable",
  }));

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });

  const periodLabel = getPeriodLabel(month, year);
  const totalAmount = pdfPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );

  doc
    .fontSize(20)
    .fillColor("#0f172a")
    .text(building.name, { align: "left" });
  doc
    .fontSize(11)
    .fillColor("#475569")
    .text(building.address ?? "Dirección no registrada")
    .moveDown(0.5);

  doc
    .fontSize(16)
    .fillColor("#0f172a")
    .text(`Historial de pagos - ${periodLabel}`, { align: "left" })
    .moveDown(0.2);

  doc
    .fontSize(11)
    .fillColor("#475569")
    .text(
      `Pagos confirmados: ${pdfPayments.length}  •  Total cobrado: ${formatCurrency(
        totalAmount,
      )}`,
    )
    .moveDown(1);

  const baseColumnWidths: [number, number, number, number, number] = [
    85, 85, 110, 155, 60,
  ];
  const minColumnWidths = [70, 70, 90, 120, 70];
  const cellPaddingX = 8;
  const cellPaddingY = 6;

  const columnWidths = [...baseColumnWidths];
  const amountTextWidths = pdfPayments.map((payment) =>
    doc.fontSize(10).widthOfString(formatCurrency(payment.amount)),
  );
  const widestAmount = amountTextWidths.length
    ? Math.max(...amountTextWidths)
    : doc.widthOfString(formatCurrency(0));
  const desiredAmountWidth = Math.min(
    140,
    Math.max(minColumnWidths[4], widestAmount + cellPaddingX * 2 + 6),
  );
  let extraNeeded = desiredAmountWidth - columnWidths[4];
  let gainedWidth = 0;
  if (extraNeeded > 0) {
    [3, 2, 1, 0].forEach((index) => {
      if (extraNeeded <= 0) return;
      const available = columnWidths[index] - minColumnWidths[index];
      if (available <= 0) return;
      const take = Math.min(extraNeeded, available);
      columnWidths[index] -= take;
      extraNeeded -= take;
      gainedWidth += take;
    });
    columnWidths[4] += gainedWidth;
  }

  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
  const columnPositions = columnWidths.reduce<number[]>((acc, _width, index) => {
    if (index === 0) {
      acc.push(0);
      return acc;
    }
    acc.push(acc[index - 1] + columnWidths[index - 1]);
    return acc;
  }, []);
  const headers = ["Fecha", "Recibo", "Unidad", "Responsable", "Monto"];
  const columnContentWidths = columnWidths.map((width) => width - cellPaddingX * 2);

  const getRowValues = (payment: PdfPayment) => [
    payment.paymentDate.toLocaleDateString("es-AR"),
    payment.receiptNumber || "-",
    payment.unitCode,
    payment.responsible,
    formatCurrency(payment.amount),
  ];

  const calculateRowHeight = (payment: PdfPayment) => {
    const values = getRowValues(payment);
    const heights = values.map((value, index) =>
      doc
        .fontSize(10)
        .heightOfString(value, { width: columnContentWidths[index] }),
    );
    const contentHeight = Math.max(...heights, 12);
    return Math.max(contentHeight + cellPaddingY * 2, 26);
  };

  const drawTableHeader = (y: number) => {
    doc
      .fontSize(10)
      .fillColor("#f1f5f9")
      .rect(doc.page.margins.left, y - 6, tableWidth, 22)
      .fill("#0f172a");
    doc.fillColor("#f8fafc");
    headers.forEach((header, index) => {
      doc.text(
        header,
        doc.page.margins.left + columnPositions[index] + cellPaddingX,
        y,
        {
          width: columnContentWidths[index],
          align: index === headers.length - 1 ? "right" : "left",
        },
      );
    });
  };

  const drawRow = (payment: PdfPayment, y: number, rowHeight: number) => {
    const values = getRowValues(payment);
    doc.fontSize(10).fillColor("#0f172a");
    values.forEach((value, index) => {
      const align = index === values.length - 1 ? "right" : "left";
      doc.text(
        value,
        doc.page.margins.left + columnPositions[index] + cellPaddingX,
        y + cellPaddingY,
        {
          width: columnContentWidths[index],
          align,
        },
      );
    });
  };

  let y = doc.y;
  drawTableHeader(y);
  y += 28;
  pdfPayments.forEach((payment, index) => {
    const dynamicRowHeight = calculateRowHeight(payment);
    if (y + dynamicRowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawTableHeader(y);
      y += 28;
    }

    if (index % 2 === 0) {
      doc
        .rect(doc.page.margins.left, y, tableWidth, dynamicRowHeight)
        .fill("#f8fafc");
    }

    drawRow(payment, y, dynamicRowHeight);
    y += dynamicRowHeight;
  });

  doc
    .moveDown(1)
    .fontSize(10)
    .fillColor("#475569")
    .text(
      `Generado el ${new Date().toLocaleDateString("es-AR")} a las ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`,
    );

  doc.end();
  const buffer = await bufferPromise;

  const toArrayBuffer = (buf: Buffer) => {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; i += 1) {
      view[i] = buf[i];
    }
    return ab;
  };

  const arrayBuffer = toArrayBuffer(buffer);
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pagos-${building.name}-${month}-${year}.pdf"`,
    },
  });
}
