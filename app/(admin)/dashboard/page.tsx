import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { calculateLateFee } from "@/lib/billing";
import { formatCurrency } from "@/lib/format";

export default async function DashboardPage() {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const [buildingsCount, unitsCount, currentMonthCharges, overdueCharges, latestPayments] =
    await Promise.all([
      prisma.building.count(),
      prisma.unit.count(),
      prisma.settlementCharge.aggregate({
        _sum: { totalToPay: true },
        where: { settlement: { month: currentMonth, year: currentYear } },
      }),
      prisma.settlementCharge.findMany({
        where: {
          totalToPay: { gt: 0 },
          settlement: {
            dueDate2: { lt: today },
            NOT: { dueDate2: null },
          },
        },
        include: { settlement: true },
      }),
      prisma.payment.findMany({
        include: { unit: true, settlement: true },
        orderBy: { paymentDate: "desc" },
        take: 5,
      }),
    ]);

  const morososDebt = overdueCharges.reduce((acc, charge) => {
    const dueDate = charge.settlement.dueDate2;
    if (!dueDate) return acc;
    const baseDebt = Number(charge.previousBalance) + Number(charge.currentFee);
    const { totalWithLate } = calculateLateFee(
      baseDebt,
      dueDate,
      today,
      Number(charge.settlement.lateFeePercentage ?? 10),
    );
    const payments = Number(charge.partialPaymentsTotal ?? 0);
    return acc + Math.max(0, totalWithLate - payments);
  }, 0);

  const currentMonthDebt = Number(currentMonthCharges._sum.totalToPay ?? 0);
  const openDebt = morososDebt + currentMonthDebt;

  const metrics = [
    { label: "Edificios", value: buildingsCount },
    { label: "Unidades", value: unitsCount },
    {
      label: "Deuda abierta",
      value: formatCurrency(openDebt),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="p-5">
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{metric.value}</p>
          </Card>
        ))}
      </div>

      <Card title="Últimos pagos" description="Registro rápido de los últimos movimientos">
        <Table>
          <THead>
            <tr>
              <Th>Fecha</Th>
              <Th>Unidad</Th>
              <Th>Período</Th>
              <Th className="text-right">Monto</Th>
            </tr>
          </THead>
          <TBody>
            {latestPayments.length === 0 && (
              <Tr>
                <Td colSpan={4}>Sin pagos registrados aún.</Td>
              </Tr>
            )}
            {latestPayments.map((p) => (
              <Tr key={p.id}>
                <Td>{p.paymentDate.toLocaleDateString("es-AR")}</Td>
                <Td>{p.unit.code}</Td>
                <Td>
                  {p.settlement.month}/{p.settlement.year}
                </Td>
                <Td className="text-right font-semibold">
                  {formatCurrency(Number(p.amount))}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card title="Estado general" description="Cobranza y expensas">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-slate-900 px-6 py-5 text-white">
            <p className="text-sm text-slate-200">Visión rápida</p>
            <p className="text-2xl font-semibold">
              Controla edificios, expensas y morosidad en una sola vista.
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Usa el menú lateral para gestionar residentes, liquidaciones y pagos.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm text-slate-500">Cobertura</p>
                <p className="text-lg font-semibold text-slate-900">Panel único</p>
              </div>
              <Badge variant="info">Admin</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm text-slate-500">Autenticación</p>
                <p className="text-lg font-semibold text-slate-900">Administrador</p>
              </div>
              <Badge variant="success">Activa</Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
