import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";

type Params = {
  paymentId: string;
};

const formatPeriod = (month: number, year: number) =>
  `${String(month).padStart(2, "0")}/${year}`;

const monthsBetween = (month: number, year: number, paymentDate: Date) => {
  const base = year * 12 + (month - 1);
  const paid = paymentDate.getFullYear() * 12 + paymentDate.getMonth();
  return paid - base;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { paymentId } = await params;

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id: Number(paymentId) },
    include: {
      settlement: { include: { building: true } },
      unit: { include: { contacts: true } },
      creditMovements: {
        where: {
          movementType: "DEBIT",
          paymentId: Number(paymentId),
        },
        select: { amount: true },
      },
    },
  });

  if (!payment) {
    return NextResponse.json(
      { message: "Pago no encontrado" },
      { status: 404 },
    );
  }
  if (payment.status === "CANCELLED") {
    return NextResponse.json(
      { message: "El pago fue anulado y no tiene recibo vigente" },
      { status: 400 },
    );
  }

  const responsable =
    payment.unit.contacts.find((c) => c.role === "RESPONSABLE")?.fullName ??
    "Sin responsable";
  const paymentDate = new Date(payment.paymentDate);
  const settlementPeriod = formatPeriod(
    payment.settlement.month,
    payment.settlement.year,
  );
  const monthsLate = Math.max(
    0,
    monthsBetween(payment.settlement.month, payment.settlement.year, paymentDate),
  );
  const isDebtPayment = monthsLate > 0;
  const typeLabel = isDebtPayment
    ? "Pago de deuda (moroso)"
    : "Liquidación actual";

  const lateFeePercentage = Number(payment.settlement.lateFeePercentage ?? 10);
  const numericAmount = Number(payment.amount);
  // Aproximamos el monto base suponiendo que el importe informado incluye recargos.
  const lateFactor = 1 + (isDebtPayment ? (lateFeePercentage / 100) * monthsLate : 0);
  const baseAmount = isDebtPayment ? numericAmount / lateFactor : numericAmount;
  const lateAmount = isDebtPayment ? numericAmount - baseAmount : 0;

  const periodsPaid = [
    {
      period: settlementPeriod,
      base: baseAmount,
      surcharge: lateAmount,
    },
  ];

  const creditDiscount = payment.creditMovements.reduce(
    (total, movement) => total + Number(movement.amount),
    0,
  );
  const totalOriginal = Math.max(0, numericAmount + creditDiscount);
  const totalAfterCredit = Math.max(0, totalOriginal - creditDiscount);

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const drawLine = () => {
    const currentY = doc.y;
    doc
      .moveTo(doc.page.margins.left, currentY)
      .lineTo(doc.page.width - doc.page.margins.right, currentY)
      .lineWidth(1)
      .strokeColor("#cbd5f5")
      .stroke();
    doc.moveDown(0.5);
  };

  const labelValue = (label: string, value: string) => {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(value);
  };

  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftColumnWidth = contentWidth * 0.6;
  const rightColumnWidth = contentWidth - leftColumnWidth;
  const headerTop = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(payment.settlement.building.name, doc.page.margins.left, headerTop, {
      width: leftColumnWidth,
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(payment.settlement.building.address, {
      width: leftColumnWidth,
    });
  const leftColumnBottom = doc.y;

  doc.y = headerTop;
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("RECIBO DE PAGO", doc.page.margins.left + leftColumnWidth, doc.y, {
      width: rightColumnWidth,
      align: "right",
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Nº Recibo: ${payment.receiptNumber}`, {
      width: rightColumnWidth,
      align: "right",
    });
  doc.text(`Fecha: ${paymentDate.toLocaleDateString("es-AR")}`, {
    width: rightColumnWidth,
    align: "right",
  });
  const rightColumnBottom = doc.y;

  doc.y = Math.max(leftColumnBottom, rightColumnBottom);
  doc.x = doc.page.margins.left;
  doc.moveDown(0.5);
  drawLine();

  doc.fontSize(11);
  labelValue("Propietario / Responsable", responsable);
  labelValue("Unidad / Depto", payment.unit.code);
  labelValue("Período principal", settlementPeriod);
  doc.moveDown(0.5);
  labelValue("Tipo de pago", typeLabel);

  doc.moveDown();
  doc.font("Helvetica-Bold").text("Detalle del pago");
  doc.moveDown(0.3);
  doc.font("Helvetica").text(`Concepto: Expensas ${settlementPeriod}`);
  doc.text(`Importe pagado: ${formatCurrency(numericAmount)}`);
  if (creditDiscount > 0) {
    doc.text(
      `Saldo a favor aplicado: ${formatCurrency(creditDiscount)} (ver totales)`,
    );
  }

  if (isDebtPayment) {
    doc.moveDown();
    doc.font("Helvetica-Bold").text("Períodos abonados");
    doc.moveDown(0.2);
    const startY = doc.y;
    const columnX = [
      doc.page.margins.left,
      doc.page.margins.left + 150,
      doc.page.margins.left + 300,
    ];
    doc.font("Helvetica-Bold");
    doc.text("Período", columnX[0], startY);
    doc.text("Monto base", columnX[1], startY);
    doc.text("Recargo", columnX[2], startY);
    let rowY = startY + 16;
    doc.font("Helvetica");
    periodsPaid.forEach((period) => {
      doc.text(period.period, columnX[0], rowY);
      doc.text(formatCurrency(period.base), columnX[1], rowY);
      doc.text(formatCurrency(period.surcharge), columnX[2], rowY);
      rowY += 16;
    });

    doc.moveTo(columnX[0], rowY + 4)
      .lineTo(columnX[2] + 120, rowY + 4)
      .lineWidth(1)
      .strokeColor("#e2e8f0")
      .stroke();

    doc.moveDown(2);
    doc.font("Helvetica-Bold").text("Recargo por mora");
    doc.font("Helvetica").text(
      `Recargo aplicado: ${formatCurrency(lateAmount)}`,
    );
    doc.text(
      `Cálculo: ${lateFeePercentage}% mensual por ${monthsLate} mes(es) de atraso.`,
    );
  }

  doc.moveDown();
  doc.font("Helvetica-Bold").text("Totales");
  if (isDebtPayment) {
    doc.font("Helvetica").text(
      `Subtotal períodos: ${formatCurrency(baseAmount)}`,
    );
    doc.text(`Recargos por mora: ${formatCurrency(lateAmount)}`);
  }
  doc.font("Helvetica").text(
    `Total original: ${formatCurrency(totalOriginal)}`,
  );
  if (creditDiscount > 0) {
    doc.text(
      `Descuento por saldo a favor: -${formatCurrency(creditDiscount)}`,
    );
  }
  doc.text(`Saldo a pagar: ${formatCurrency(totalAfterCredit)}`);
  doc
    .font("Helvetica-Bold")
    .text(`Total pagado: ${formatCurrency(numericAmount)}`);

  doc.moveDown();
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Este recibo acredita el pago correspondiente a los períodos indicados. Conserve este comprobante como constancia de pago.",
    );

  doc.moveDown(2);
  const signatureY = doc.y + 20;
  doc
    .moveTo(doc.page.margins.left, signatureY)
    .lineTo(doc.page.width - doc.page.margins.right, signatureY)
    .strokeColor("#94a3b8")
    .lineWidth(1)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(
      "Firma y aclaración – Administración",
      doc.page.margins.left,
      signatureY + 5,
      {
        align: "center",
      },
    );

  doc.moveDown(4);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#475569")
    .text("Documento generado por Sistema de Gestión de Consorcios", {
      align: "center",
    });
  doc
    .fontSize(8)
    .text("Desarrollado por Sistemas del Norte – Soluciones Digitales", {
      align: "center",
    })
    .fillColor("#000000");

  doc.end();

  const pdfBuffer: Buffer = await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const body = new Uint8Array(pdfBuffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=recibo-${payment.receiptNumber}.pdf`,
    },
  });
}
