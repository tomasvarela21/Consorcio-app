import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export default async function BuildingOverview({
  params,
}: {
  params: Promise<{ buildingId: string }>;
}) {
  const { buildingId: buildingParam } = await params;
  const buildingId = Number(buildingParam);
  if (Number.isNaN(buildingId)) {
    return null;
  }
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const [
    units,
    settlements,
    recentPayments,
    debtPending,
    debtorsCount,
    currentSettlement,
    currentCharges,
    paymentsThisMonth,
  ] = await Promise.all([
    prisma.unit.findMany({
      where: { buildingId },
      include: { contacts: true },
      orderBy: { code: "asc" },
      take: 5,
    }),
    prisma.settlement.findMany({
      where: { buildingId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 3,
    }),
    prisma.payment.findMany({
      where: { settlement: { buildingId } },
      include: { unit: true },
      orderBy: { paymentDate: "desc" },
      take: 5,
    }),
    prisma.settlementCharge.aggregate({
      _sum: { totalToPay: true },
      where: {
        settlement: { buildingId },
        status: { in: ["PENDING", "PARTIAL"] },
      },
    }),
    prisma.settlementCharge.groupBy({
      by: ["unitId"],
      where: {
        settlement: {
          buildingId,
          dueDate2: { lt: today },
          NOT: { dueDate2: null },
        },
        totalToPay: { gt: 0 },
      },
    }),
    prisma.settlement.findFirst({
      where: { buildingId, month: currentMonth, year: currentYear },
      include: { charges: true },
    }),
    prisma.settlementCharge.findMany({
      where: {
        settlement: { buildingId, month: currentMonth, year: currentYear },
      },
      include: { settlement: true, unit: { include: { contacts: true } } },
    }),
    prisma.payment.findMany({
      where: {
        settlement: { buildingId, month: currentMonth, year: currentYear },
      },
    }),
  ]);

  const deudaTotal = Number(debtPending._sum.totalToPay ?? 0);
  const totalExpensasMes = Number(currentSettlement?.totalExpense ?? 0);
  const deudaMes = currentCharges.reduce(
    (acc, c) => acc + Number(c.totalToPay),
    0,
  );
  const pagosMes = paymentsThisMonth.reduce(
    (acc, p) => acc + Number(p.amount),
    0,
  );

  const morososVencidos = currentCharges.filter(
    (c) =>
      Number(c.totalToPay) > 0 &&
      c.settlement.dueDate2 &&
      c.settlement.dueDate2 < today,
  );

  const porVencer = currentCharges.filter((c) => {
    if (!c.settlement.dueDate2) return false;
    const diff = c.settlement.dueDate2.getTime() - today.getTime();
    return (
      Number(c.totalToPay) > 0 &&
      diff > 0 &&
      diff <= 7 * 24 * 60 * 60 * 1000
    );
  });

  const proximosVencimientos = porVencer.slice(0, 5).map((c) => ({
    unitCode: c.unit.code,
    responsable:
      c.unit.contacts.find((ct) => ct.role === "RESPONSABLE")?.fullName ??
      "Sin responsable",
    fecha: c.settlement.dueDate2,
    monto: Number(c.totalToPay),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm uppercase tracking-wide text-slate-500">
          Dashboard de expensas, pagos y morosos
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">Edificio</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Link
          href={`/buildings/${buildingId}/settlements`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-5 h-full">
            <p className="text-sm text-slate-500">Total expensas del mes</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatCurrency(totalExpensasMes)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Este mes</p>
          </Card>
        </Link>
        <Link
          href={`/buildings/${buildingId}/payments?month=${currentMonth}&year=${currentYear}`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-5 h-full">
            <p className="text-sm text-slate-500">Pagos cobrados este mes</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatCurrency(pagosMes)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Liquidaciones del mes
            </p>
          </Card>
        </Link>
        <Link
          href={`/buildings/${buildingId}/settlements`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-5 h-full">
            <p className="text-sm text-slate-500">Deuda total del mes</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatCurrency(deudaMes)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pendiente del periodo</p>
          </Card>
        </Link>
        <Link
          href={`/buildings/${buildingId}/debtors`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-5 h-full">
            <p className="text-sm text-slate-500">Unidades morosas</p>
            <p className="text-2xl font-semibold text-slate-900">
              {debtorsCount.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Registradas en morosos</p>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href={`/buildings/${buildingId}/debtors`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pagos vencidos</p>
                <p className="text-2xl font-semibold text-red-600">
                  {morososVencidos.length}
                </p>
              </div>
              <Button variant="secondary">Ver morosos</Button>
            </div>
          </Card>
        </Link>
        <Link
          href={`/buildings/${buildingId}/settlements`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Por vencer (7 dias)</p>
                <p className="text-2xl font-semibold text-amber-600">
                  {porVencer.length}
                </p>
              </div>
              <Button variant="secondary">Ver liquidaciones</Button>
            </div>
          </Card>
        </Link>
        <Link
          href={`/buildings/${buildingId}/payments?month=${currentMonth}&year=${currentYear}`}
          className="block transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Pagos registrados este mes
                </p>
                <p className="text-2xl font-semibold text-emerald-600">
                  {paymentsThisMonth.length}
                </p>
              </div>
              <Button variant="secondary">Ver pagos</Button>
            </div>
          </Card>
        </Link>
      </div>

      <Card
        title="Últimas liquidaciones"
        actions={
          <div className="flex gap-2">
            <Link href={`/buildings/${buildingId}/settlements`}>
              <Button variant="secondary">Ver liquidaciones</Button>
            </Link>
            <Link href={`/buildings/${buildingId}/settlements`}>
              <Button>Nueva liquidación</Button>
            </Link>
          </div>
        }
      >
        <Table>
          <THead>
            <tr>
              <Th>Mes/Año</Th>
              <Th>Gasto total</Th>
              <Th>Vencimientos</Th>
            </tr>
          </THead>
          <TBody>
            {settlements.length === 0 && (
              <Tr>
                <Td colSpan={3} className="text-slate-500">
                  Aún no hay liquidaciones para este edificio.
                </Td>
              </Tr>
            )}
            {settlements.map((s) => (
              <Tr key={s.id}>
                <Td>
                  {s.month}/{s.year}
                </Td>
                <Td>{formatCurrency(Number(s.totalExpense))}</Td>
                <Td className="space-x-2">
                  {s.dueDate1 && (
                    <Badge variant="info">
                      1° {s.dueDate1.toLocaleDateString("es-AR")}
                    </Badge>
                  )}
                  {s.dueDate2 && (
                    <Badge variant="warning">
                      2° {s.dueDate2.toLocaleDateString("es-AR")}
                    </Badge>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card
        title="Unidades recientes"
        description="Últimos residentes cargados"
        actions={
          <Link href={`/buildings/${buildingId}/residents`}>
            <Button variant="secondary">Ver residentes</Button>
          </Link>
        }
      >
        <Table>
          <THead>
            <tr>
              <Th>Unidad</Th>
              <Th>Responsable</Th>
              <Th>Porcentaje</Th>
            </tr>
          </THead>
          <TBody>
            {units.length === 0 && (
              <Tr>
                <Td colSpan={3} className="text-slate-500">
                  Aún no hay unidades cargadas.{" "}
                  <Link
                    href={`/buildings/${buildingId}/residents`}
                    className="text-slate-900 underline"
                  >
                    Registrar primer residente
                  </Link>
                </Td>
              </Tr>
            )}
            {units.map((u) => {
              const responsable = u.contacts.find(
                (c) => c.role === "RESPONSABLE",
              );
              return (
                <Tr key={u.id}>
                  <Td>{u.code}</Td>
                  <Td>{responsable?.fullName ?? "Sin responsable"}</Td>
                  <Td className="text-right">
                    {Number(u.percentage)}%
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card
        title="Morosos destacados"
        description="Unidades con deuda pendiente"
        actions={
          <Link href={`/buildings/${buildingId}/debtors`}>
            <Button variant="secondary">Ver morosos</Button>
          </Link>
        }
      >
        {debtorsCount.length === 0 ? (
          <p className="text-sm text-emerald-600">
            Actualmente no hay unidades morosas.
          </p>
        ) : (
          <p className="text-sm text-slate-700">
            {debtorsCount.length} unidades con deuda. Revisa el módulo de
            morosos para gestionar pagos.
          </p>
        )}
      </Card>

      <Card
        title="Próximos vencimientos"
        description="Cargos con vencimiento en los próximos 7 días"
      >
        {proximosVencimientos.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay vencimientos próximos en los siguientes 7 días.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Unidad</Th>
                <Th>Responsable</Th>
                <Th>Fecha</Th>
                <Th className="text-right">Monto</Th>
              </tr>
            </THead>
            <TBody>
              {proximosVencimientos.map((v, idx) => (
                <Tr key={`${v.unitCode}-${idx}`}>
                  <Td>{v.unitCode}</Td>
                  <Td>{v.responsable}</Td>
                  <Td>{v.fecha?.toLocaleDateString("es-AR")}</Td>
                  <Td className="text-right">{formatCurrency(v.monto)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
