"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Debtor = {
  unitId: number;
  unitCode: string;
  responsable: string;
  totalDebt: number;
  periods: Array<{
    settlementId: number;
    month: number;
    year: number;
    originalDebt: number;
    monthsLate: number;
    lateAmount: number;
    totalWithLate: number;
  }>;
};

export default function DebtorsPage() {
  const params = useParams<{ buildingId: string }>();
  const buildingId = Number(params.buildingId);

  const [unitFilter, setUnitFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [rows, setRows] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Debtor | null>(null);
  const [openDetail, setOpenDetail] = useState(false);
  const [openPay, setOpenPay] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

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
    const period = debtor.periods[0];
    setSelectedPeriodId(period?.settlementId ?? null);
    setPayAmount(period ? period.totalWithLate.toString() : "");
    setReceiptNumber("");
    setOpenPay(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !selectedPeriodId) return;
    const period = selected.periods.find((p) => p.settlementId === selectedPeriodId);
    if (!period) return;
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settlementId: selectedPeriodId,
        unitId: selected.unitId,
        amount: Number(payAmount),
        receiptNumber,
        paymentDate,
      }),
    });
    if (res.ok) {
      toast.success("Pago aplicado");
      setOpenPay(false);
      load();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "No se pudo registrar el pago");
    }
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

      <Table>
        <THead>
          <tr>
            <Th>Unidad</Th>
            <Th>Responsable</Th>
            <Th className="text-right">Deuda total</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <TBody>
          {loading && (
            <Tr>
              <Td colSpan={4}>Cargando morosos...</Td>
            </Tr>
          )}
          {!loading && filtered.length === 0 && (
            <Tr>
              <Td colSpan={4} className="text-slate-500">
                Actualmente no hay unidades morosas.
              </Td>
            </Tr>
          )}
          {filtered.map((d) => (
            <Tr key={d.unitId}>
              <Td>{d.unitCode}</Td>
              <Td>{d.responsable}</Td>
              <Td className="text-right font-semibold">${d.totalDebt.toFixed(2)}</Td>
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
            {selected.periods.map((p) => (
              <div
                key={p.settlementId}
                className="rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {p.month}/{p.year}
                  </span>
                  <span>${p.totalWithLate.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <span>Saldo original: ${p.originalDebt.toFixed(2)}</span>
                  <span>Recargo: ${p.lateAmount.toFixed(2)}</span>
                  <span>Meses de atraso: {p.monthsLate}</span>
                </div>
              </div>
            ))}
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
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">Período</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={selectedPeriodId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedPeriodId(id);
                  const period = selected.periods.find((p) => p.settlementId === id);
                  if (period) setPayAmount(period.totalWithLate.toString());
                }}
              >
                {selected.periods.map((p) => (
                  <option key={p.settlementId} value={p.settlementId}>
                    {p.month}/{p.year} · ${p.totalWithLate.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Monto a pagar"
              type="number"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
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
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={() => setOpenPay(false)}>
                Cancelar
              </Button>
              <Button type="submit">Confirmar pago</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
