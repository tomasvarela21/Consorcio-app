// app/api/pdf/receipt/[paymentId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

type Params = {
  paymentId: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
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
    },
  });

  if (!payment) {
    return NextResponse.json(
      { message: "Pago no encontrado" },
      { status: 404 },
    );
  }

  const responsable =
    payment.unit.contacts.find((c) => c.role === "RESPONSABLE")?.fullName ??
    "Sin responsable";

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.fontSize(20).text("Recibo de pago", { align: "center" });
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`Edificio: ${payment.settlement.building.name}`);
  doc.text(`Dirección: ${payment.settlement.building.address}`);
  doc.moveDown();
  doc.text(`Unidad: ${payment.unit.code}`);
  doc.text(`Responsable: ${responsable}`);
  doc.moveDown();
  doc.text(`Monto pagado: $${Number(payment.amount).toFixed(2)}`);
  doc.text(`Número de recibo: ${payment.receiptNumber}`);
  doc.text(
    `Fecha de pago: ${payment.paymentDate.toLocaleDateString("es-AR")}`,
  );
  doc.text(`Período: ${payment.settlement.month}/${payment.settlement.year}`);
  doc.moveDown();
  doc.text("Gracias por su pago.", { align: "center" });
  doc.end();

  const pdfBuffer: Buffer = await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const body = new Uint8Array(pdfBuffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=recibo-${paymentId}.pdf`,
    },
  });
}
