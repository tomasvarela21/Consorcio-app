"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/format";

type MorosoPeriod = {
  settlementId: number;
  month: number;
  year: number;
  originalDebt: number;
  deudaPendiente: number;
  partialPayments: number;
  monthsLate: number;
  latePercentage: number;
  lateAmount: number;
  lateAmountPending: number;
  pendingAmount: number;
};

type Debtor = {
  unitId: number;
  unitCode: string;
  responsable: string;
  creditBalance: number;
  totalDebt: number;
  periods: MorosoPeriod[];
};

type PaymentSummary = {
  amount: number;
  morosoPrevio: number;
  morosoFinal: number;
  appliedToMorosos: number;
  appliedFromPayment: number;
  appliedFromCredit: number;
  creditBalance: number;
  appliedToUpcomingSettlements: number;
  upcomingSettlementAllocations: Array<{
    chargeId: number;
    settlementId: number;
    month: number;
    year: number;
    appliedAmount: number;
    totalToPayBefore: number;
    totalToPayAfter: number;
  }>;
  allocations: Array<{
    settlementId: number;
    chargeId: number;
    month: number;
    year: number;
    appliedPrincipalFromPayment: number;
    appliedPrincipalFromCredit: number;
    appliedLateFromPayment: number;
    appliedLateFromCredit: number;
    totalApplied: number;
  }>;
};

export default function DebtorsPage() {
  const params = useParams<{ buildingId: string }>();
  const buildingId = Number(params.buildingId);
  const router = useRouter();

  const [unitFilter, setUnitFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [rows, setRows] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Debtor | null>(null);
  const [openDetail, setOpenDetail] = useState(false);
  const [openPay, setOpenPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentLocked, setPaymentLocked] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/buildings/${buildingId}/debtors`);
    if (res.ok) {
      setRows(await res.json());
    } else {
      toast.error("No pudimos cargar morosos");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [buildingId]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.unitCode.toLowerCase().includes(unitFilter.toLowerCase()) &&
          r.responsable.toLowerCase().includes(responsibleFilter.toLowerCase()),
      ),
    [rows, unitFilter, responsibleFilter],
  );

  const openDetailModal = (debtor: Debtor) => {
    setSelected(debtor);
    setOpenDetail(true);
  };

  const openPayModal = (debtor: Debtor) => {
    setSelected(debtor);
    setPayAmount(debtor.totalDebt.toFixed(2));
    setReceiptNumber("");
    setPaymentSummary(null);
    setPaying(false);
    setPaymentLocked(false);
    setOpenPay(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || paying || paymentLocked) return;
    const amountValue = Number(payAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setPaying(true);
    try {
      const res = await fetch(`/api/buildings/${buildingId}/debtors/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selected.unitId,
          amount: amountValue,
          receiptNumber,
          paymentDate,
        }),
      });
      if (res.ok) {
        const summary = (await res.json()) as PaymentSummary;
        setPaymentSummary(summary);
        setPaymentLocked(true);
        toast.success("Pago aplicado");
        load();
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message ?? "No se pudo registrar el pago");
      }
    } catch (error) {
      toast.error("Error de red al registrar el pago");
      console.error(error);
    } finally {
      setPaying(false);
    }
  };

  const renderDetail = (period: MorosoPeriod) => (
    <div key={period.settlementId} className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex items-center justify-between font-semibold">
        <span>
          {period.month}/{period.year}
        </span>
        <span>{formatCurrency(period.pendingAmount)}</span>
      </div>
      <div className="grid gap-2 text-slate-600 md:grid-cols-2">
        <span>Deuda original: {formatCurrency(period.originalDebt)}</span>
        <span>Pagos parciales aplicados: {formatCurrency(period.partialPayments)}</span>
        <span>Saldo base pendiente: {formatCurrency(period.deudaPendiente)}</span>
        <span>Meses de atraso: {period.monthsLate}</span>
        <span>
          Recargo calculado ({period.latePercentage}% × {period.monthsLate}): {formatCurrency(period.lateAmount)}
        </span>
        <span>Recargo pendiente: {formatCurrency(period.lateAmountPending)}</span>
        <span className="col-span-2 font-semibold text-slate-900">
          Total a pagar: {formatCurrency(period.deudaPendiente + period.lateAmountPending)}
        </span>
      </div>
    </div>
  );

  const renderSummary = () => {
    if (!paymentSummary) return null;
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <h4 className="mb-2 font-semibold text-slate-900">Resumen del pago</h4>
        <div className="grid gap-1 text-slate-700 md:grid-cols-2">
          <span>Monto ingresado: {formatCurrency(paymentSummary.amount)}</span>
          <span>
            Aplicado a morosos: {formatCurrency(paymentSummary.appliedToMorosos)}
          </span>
          <span>Saldo moroso previo: {formatCurrency(paymentSummary.morosoPrevio)}</span>
          <span>Saldo moroso final: {formatCurrency(paymentSummary.morosoFinal)}</span>
          <span>Usado del pago: {formatCurrency(paymentSummary.appliedFromPayment)}</span>
          <span>Usado de saldo a favor: {formatCurrency(paymentSummary.appliedFromCredit)}</span>
          <span>
            Aplicado a liquidaciones vigentes: {formatCurrency(
              paymentSummary.appliedToUpcomingSettlements,
            )}
          </span>
          <span className="col-span-2">
            Saldo a favor disponible: {formatCurrency(paymentSummary.creditBalance)}
          </span>
        </div>
        {paymentSummary.allocations.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
              Distribución por liquidación
            </p>
            <div className="space-y-2">
              {paymentSummary.allocations.map((alloc) => (
                <div key={alloc.chargeId} className="rounded border border-slate-200 p-2 text-xs">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>
                      {alloc.month}/{alloc.year}
                    </span>
                    <span>{formatCurrency(alloc.totalApplied)}</span>
                  </div>
                  <p>
                    Capital: {formatCurrency(
                      alloc.appliedPrincipalFromPayment + alloc.appliedPrincipalFromCredit,
                    )}
                  </p>
                  <p>
                    Recargo: {formatCurrency(
                      alloc.appliedLateFromPayment + alloc.appliedLateFromCredit,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {paymentSummary.upcomingSettlementAllocations.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
              Adelantos aplicados a liquidaciones vigentes
            </p>
            <div className="space-y-2">
              {paymentSummary.upcomingSettlementAllocations.map((alloc) => (
                <div key={`upcoming-${alloc.chargeId}`} className="rounded border border-dashed border-slate-200 p-2 text-xs">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>
                      {alloc.month}/{alloc.year}
                    </span>
                    <span>{formatCurrency(alloc.appliedAmount)}</span>
                  </div>
                  <p>
                    Antes: {formatCurrency(alloc.totalToPayBefore)} · Después: {formatCurrency(alloc.totalToPayAfter)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Morosos</h2>
          <p className="text-sm text-slate-500">
            Unidades con deuda vencida y recargos calculados al día.
          </p>
        </div>
        <Input label="Unidad" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} />
        <Input
          label="Responsable"
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
        />
      </div>

      <Table viewportClassName="max-h-[65vh] overflow-y-auto">
        <THead>
          <tr>
            <Th>Unidad</Th>
            <Th>Responsable</Th>
            <Th>Períodos adeudados</Th>
            <Th className="text-right">Deuda total</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <TBody>
          {loading && (
            <Tr>
              <Td colSpan={5}>Cargando morosos...</Td>
            </Tr>
          )}
          {!loading && filtered.length === 0 && (
            <Tr>
              <Td colSpan={5} className="text-slate-500">
                Actualmente no hay unidades morosas.
              </Td>
            </Tr>
          )}
          {filtered.map((d) => (
            <Tr key={d.unitId}>
              <Td>{d.unitCode}</Td>
              <Td>{d.responsable}</Td>
              <Td>
                <div className="flex flex-wrap gap-1 text-xs text-slate-600">
                  {d.periods.map((p) => (
                    <span
                      key={p.settlementId}
                      className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700"
                    >
                      {p.month}/{p.year}
                    </span>
                  ))}
                </div>
              </Td>
              <Td className="text-right font-semibold">{formatCurrency(d.totalDebt)}</Td>
              <Td className="space-x-2">
                <Button variant="secondary" onClick={() => openDetailModal(d)}>
                  Ver detalle
                </Button>
                <Button onClick={() => openPayModal(d)}>Realizar pago</Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Modal
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        title={`Detalle de deuda ${selected?.unitCode ?? ""}`}
      >
        {selected ? (
          <div className="space-y-3">
            {selected.periods.map(renderDetail)}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un moroso para ver el detalle.</p>
        )}
      </Modal>

      <Modal
        open={openPay}
        onClose={() => setOpenPay(false)}
        title={`Pago moroso ${selected?.unitCode ?? ""}`}
      >
        {selected && (
          <form className="space-y-4" onSubmit={submitPayment}>
            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm">
              <p>Saldo moroso: {formatCurrency(selected.totalDebt)}</p>
              <p>Saldo a favor disponible: {formatCurrency(selected.creditBalance)}</p>
            </div>
            <Input
              label="Monto a pagar"
              type="number"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              required
            />
            <Input
              label="Número de recibo"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              required
            />
            <Input
              label="Fecha de pago"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              El pago se distribuirá automáticamente desde la liquidación más antigua hacia la más reciente.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={() => setOpenPay(false)}>
                Cancelar
              </Button>
              <div className="space-y-1">
                <Button
                  type="submit"
                  loading={paying}
                  disabled={paymentLocked}
                >
                  {paymentLocked ? "Pago registrado" : "Confirmar pago"}
                </Button>
                {paymentLocked && (
                  <p className="text-xs text-slate-500">
                    Este pago ya se confirmó. Cerrá el modal para iniciar otro.
                  </p>
                )}
              </div>
            </div>
            {renderSummary()}
          </form>
        )}
      </Modal>
    </div>
  );
}
