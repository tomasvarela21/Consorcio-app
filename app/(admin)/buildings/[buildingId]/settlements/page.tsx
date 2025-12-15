"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { compareUnitCodes } from "@/lib/sort";
import {
  EARLY_PAYMENT_DISCOUNT_RATE,
  getChargePortions,
  getDiscountStats,
  roundTwo,
} from "@/lib/billing";

type ChargeRow = {
  id: number;
  unitId: number;
  unitCode: string;
  responsable: string;
  previousBalance: number;
  currentFee: number;
  partialPaymentsTotal: number;
  totalToPay: number;
  status: string;
  discountApplied: number;
};

type SettlementSummary = {
  id: number;
  month: number;
  year: number;
  totalExpense: number;
  dueDate1: string | null;
  dueDate2: string | null;
  lateFeePercentage?: number;
  percentageCoverage?: number;
  uncoveredAmount?: number;
} | null;

type AccountHistory = {
  unit: { id: number; code: string; building: string; responsable: string | null };
  periods: Array<{
    settlementId: number;
    month: number;
    year: number;
    previousBalance: number;
    currentFee: number;
    partialPaymentsTotal: number;
    totalToPay: number;
    status: string;
    payments: Array<{
      id: number;
      amount: number;
      receiptNumber: string;
      paymentDate: string;
      notes?: string | null;
      status: "COMPLETED" | "CANCELLED";
      canceledAt: string | null;
    }>;
  }>;
} | null;

type CreditUsageSummary = {
  appliedToCurrent: number;
  excedente: number;
  appliedToMorosos: number;
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
  morosoPrevio: number;
  morosoFinal: number;
  creditBalance: number;
};

export default function SettlementsPage() {
  const params = useParams<{ buildingId: string }>();
  const buildingId = Number(params.buildingId);
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [settlement, setSettlement] = useState<SettlementSummary>(null);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    totalExpense?: number;
    collected?: number;
    collectionRate?: number;
  }>({});

  const [openNew, setOpenNew] = useState(false);
  const [newMonth, setNewMonth] = useState(today.getMonth() + 1);
  const [newYear, setNewYear] = useState(today.getFullYear());
  const [totalExpense, setTotalExpense] = useState("");
  const [dueDate1, setDueDate1] = useState("");
  const [dueDate2, setDueDate2] = useState("");
  const [lateFeePercentage, setLateFeePercentage] = useState("10");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [openPayment, setOpenPayment] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<ChargeRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(today.toISOString().slice(0, 10));
  const [creditSummary, setCreditSummary] = useState<CreditUsageSummary | null>(null);
  const [creditPreview, setCreditPreview] = useState<CreditUsageSummary | null>(null);
  const [creditSyncing, setCreditSyncing] = useState(false);

  const [accountOpen, setAccountOpen] = useState(false);
  const [accountData, setAccountData] = useState<AccountHistory>(null);
  const [search, setSearch] = useState("");

  const discountLabel = `${Math.round(EARLY_PAYMENT_DISCOUNT_RATE * 100)}%`;

  const getChargeState = (charge: Partial<ChargeRow>) =>
    getChargePortions({
      previousBalance: Number(charge.previousBalance ?? 0),
      currentFee: Number(charge.currentFee ?? 0),
      partialPaymentsTotal: Number(charge.partialPaymentsTotal ?? 0),
      discountApplied: Number(charge.discountApplied ?? 0),
    });

  const computeDueForDate = (charge: ChargeRow, reference: Date) => {
    const state = getChargeState(charge);
    const currentFee = Number(charge.currentFee ?? 0);
    const discountStats = getDiscountStats(
      currentFee,
      Number(charge.discountApplied ?? 0),
    );
    const firstDue = settlement?.dueDate1 ? new Date(settlement.dueDate1) : null;
    const isValidReference = !Number.isNaN(reference.getTime());
    const discountWindowActive =
      !!firstDue && isValidReference && reference <= firstDue;
    let discountPreview = 0;
    if (
      discountWindowActive &&
      state.currentOutstandingNominal > 0 &&
      discountStats.remaining > 0
    ) {
      discountPreview = Math.min(
        discountStats.remaining,
        state.currentOutstandingNominal,
      );
    }
    const currentDue = Math.max(
      0,
      roundTwo(state.currentOutstandingNominal - discountPreview),
    );
    const totalDue = roundTwo(state.previousOutstanding + currentDue);
    return {
      totalDue,
      discountPreview,
      discountActive: discountPreview > 0,
      currentPaid: state.currentPaid,
    };
  };

  const moneyOrDash = (value: number) =>
    Math.abs(value) < 0.005 ? (
      <span className="inline-block w-full text-center">-</span>
    ) : (
      <span>{formatCurrency(value)}</span>
    );

  const loadData = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/buildings/${buildingId}/settlements?month=${month}&year=${year}`,
    );
    if (res.ok) {
      const body = await res.json();
      setSettlement(body.settlement);
      const orderedCharges: ChargeRow[] = Array.isArray(body.charges)
        ? [...body.charges].sort((a: ChargeRow, b: ChargeRow) =>
            compareUnitCodes(a.unitCode, b.unitCode),
          )
        : [];
      setCharges(orderedCharges);
      if (orderedCharges.length) {
        const totalExpense = body.settlement?.totalExpense ?? 0;
        const collected =
          orderedCharges.reduce(
            (acc: number, c: ChargeRow) =>
              acc + (c.currentFee + c.previousBalance - c.totalToPay),
            0,
          ) ?? 0;
        const collectionRate =
          totalExpense > 0 ? Math.min(100, (collected / totalExpense) * 100) : 0;
        setSummary({ totalExpense, collected, collectionRate });
      } else {
        setSummary({});
      }
    } else {
      toast.error("No pudimos cargar la liquidación");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [month, year, buildingId]);

  const filteredCharges = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return charges;
    return charges.filter((c) =>
      c.unitCode.toLowerCase().includes(query) ||
      (c.responsable ?? "").toLowerCase().includes(query),
    );
  }, [charges, search]);

  const handleNewSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/buildings/${buildingId}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: Number(newMonth),
        year: Number(newYear),
        totalExpense: Number(totalExpense),
        dueDate1: dueDate1 || null,
        dueDate2: dueDate2 || null,
        lateFeePercentage: Number(lateFeePercentage),
      }),
    });
    if (res.ok) {
      toast.success("Liquidación creada");
      setOpenNew(false);
      setMonth(Number(newMonth));
      setYear(Number(newYear));
      loadData();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "Error al crear liquidación");
    }
  };

  const openPayModal = async (charge: ChargeRow) => {
    setSelectedCharge(charge);
    const recommendation = computeDueForDate(charge, today);
    setPayAmount(recommendation.totalDue.toFixed(2));
    setReceiptNumber("");
    const todayStr = today.toISOString().slice(0, 10);
    setPaymentDate(todayStr);
    setOpenPayment(true);
    setCreditPreview(null);
    if (!settlement) return;
    setCreditSyncing(true);
    try {
      const res = await fetch(`/api/units/${charge.unitId}/credit/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementId: settlement.id,
          referenceDate: todayStr,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        if (body.summary) {
          setCreditPreview(body.summary);
        }
        if (body.charge) {
          const updatedCharge = {
            ...charge,
            ...body.charge,
          };
          setSelectedCharge(updatedCharge);
          const updatedRecommendation = computeDueForDate(updatedCharge, today);
          setPayAmount(updatedRecommendation.totalDue.toFixed(2));
        }
        loadData();
      } else {
        toast.error(body.message ?? "No pudimos aplicar el saldo a favor");
      }
    } catch {
      toast.error("No pudimos aplicar el saldo a favor");
    } finally {
      setCreditSyncing(false);
    }
  };

  const closePaymentModal = () => {
    setOpenPayment(false);
    setCreditPreview(null);
    setCreditSyncing(false);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCharge || !settlement) return;
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settlementId: settlement.id,
        unitId: selectedCharge.unitId,
        amount: Number(payAmount),
        receiptNumber,
        paymentDate,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setCreditSummary(body.summary ?? null);
      setCreditPreview(null);
      setCreditSyncing(false);
      toast.success("Pago registrado");
      loadData();
      closePaymentModal();
      setSelectedCharge(null);
    } else {
      toast.error(body.message ?? "Error al registrar pago");
    }
  };

  const paymentPreview = useMemo(() => {
    if (!selectedCharge || !settlement || !paymentDate) return null;
    const reference = new Date(paymentDate);
    if (Number.isNaN(reference.getTime())) return null;
    return computeDueForDate(selectedCharge, reference);
  }, [selectedCharge, settlement, paymentDate]);

  useEffect(() => {
    if (!openPayment || !paymentPreview) return;
    setPayAmount(paymentPreview.totalDue.toFixed(2));
  }, [openPayment, paymentPreview]);

  const handleAccountHistory = async (unitId: number) => {
    const res = await fetch(`/api/units/${unitId}/account-history`);
    if (res.ok) {
      const body = await res.json();
      setAccountData(body);
      setAccountOpen(true);
    } else {
      toast.error("Error al obtener estado de cuenta");
    }
  };

  const statusColor = (status: string) => {
    if (status === "PAID") return "success";
    if (status === "PARTIAL") return "warning";
    return "danger";
  };

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_v, i) => i + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold text-slate-900">Liquidaciones</h2>
          <p className="text-sm text-slate-500">Busca por mes y año.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col text-xs font-semibold text-slate-600">
            <label>Mes</label>
            <select
              className="h-9 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-xs font-semibold text-slate-600">
            <label>Año</label>
            <input
              className="h-9 w-28 rounded-md border border-slate-300 px-2 text-sm"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <Button variant="secondary" onClick={loadData} disabled={loading} className="h-9">
            Aplicar
          </Button>
        </div>
        <div className="flex-1" />
        <div className="w-full max-w-xs">
          <Input
            label="Buscar unidad o responsable"
            value={search}
            placeholder="Ej: 12-A o García"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {settlement && (
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Eliminar liquidación
          </Button>
        )}
        <Button onClick={() => setOpenNew(true)}>Nueva liquidación</Button>
      </div>

      {typeof settlement?.percentageCoverage === "number" && (
        <CoverageNotice
          value={settlement?.percentageCoverage ?? 0}
          uncovered={settlement?.uncoveredAmount ?? 0}
        />
      )}
      {creditSummary && (
        <CreditUsageAlert summary={creditSummary} onClose={() => setCreditSummary(null)} />
      )}

      {settlement && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-500">Gasto total período</p>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.totalExpense ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-500">Cobrado</p>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.collected ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-500">% Cobranza</p>
            <p className="text-2xl font-semibold">
              {summary.collectionRate ? summary.collectionRate.toFixed(1) : "0"}%
            </p>
          </div>
        </div>
      )}

      {settlement ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Período {settlement.month}/{settlement.year}
              </p>
              <p className="text-lg font-semibold text-slate-900">
                Gasto total: {formatCurrency(settlement.totalExpense)}
              </p>
              <p className="text-sm text-slate-500">
                Vencimientos:{" "}
                {settlement.dueDate1 ? new Date(settlement.dueDate1).toLocaleDateString("es-AR") : "N/A"}{" "}
                ·{" "}
                {settlement.dueDate2 ? new Date(settlement.dueDate2).toLocaleDateString("es-AR") : "N/A"}
                {typeof settlement.lateFeePercentage === "number" && (
                  <span className="ml-2 text-xs text-slate-500">
                    Recargo morosos: {settlement.lateFeePercentage}%
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No hay liquidación para {month}/{year}. Crea una para comenzar.
        </div>
      )}

      {settlement && (
        <Table viewportClassName="max-h-[65vh] overflow-y-auto">
          <THead>
            <tr>
              <Th>Unidad</Th>
              <Th>Responsable</Th>
              <Th className="text-right">Expensa actual</Th>
              <Th className="text-right">Pago parcial</Th>
              <Th className="text-right">Total a pagar</Th>
              <Th>Estado</Th>
              <Th>Acciones</Th>
            </tr>
          </THead>
          <TBody>
            {charges.length === 0 && (
              <Tr>
                <Td colSpan={7}>Sin cargos en esta liquidación.</Td>
              </Tr>
            )}
            {charges.length > 0 && filteredCharges.length === 0 && (
              <Tr>
                <Td colSpan={7}>No se encontraron resultados para "{search}".</Td>
              </Tr>
            )}
            {filteredCharges.map((c) => {
              const state = getChargeState(c);
              const dueInfo = computeDueForDate(c, today);
              const discountCap = roundTwo(
                Number(c.currentFee ?? 0) * EARLY_PAYMENT_DISCOUNT_RATE,
              );
              const discountedCurrentFee = Math.max(
                0,
                roundTwo(Number(c.currentFee ?? 0) - discountCap),
              );
              const firstDueDate = settlement?.dueDate1
                ? new Date(settlement.dueDate1)
                : null;
              const showDiscountInfo =
                firstDueDate &&
                !Number.isNaN(firstDueDate.getTime()) &&
                today <= firstDueDate &&
                discountCap > 0;
              return (
                <Tr key={c.id}>
                  <Td className="font-semibold">{c.unitCode}</Td>
                  <Td>{c.responsable}</Td>
                  <Td className="text-right">
                    {moneyOrDash(c.currentFee)}
                    {showDiscountInfo && (
                      <span className="block text-xs text-emerald-600">
                        Con {discountLabel}: {formatCurrency(discountedCurrentFee)}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {moneyOrDash(state.currentPaid)}
                  </Td>
                  <Td className="text-right font-semibold">
                    <div className="flex flex-col items-end">
                      {moneyOrDash(dueInfo.totalDue)}
                      {dueInfo.discountActive && (
                        <span className="text-xs font-medium text-emerald-600">
                          Incluye {discountLabel} de descuento por pago dentro del primer vencimiento
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={statusColor(c.status)}>
                      {c.status === "PENDING" && "Pendiente"}
                      {c.status === "PARTIAL" && "Parcial"}
                      {c.status === "PAID" && "Pagado"}
                    </Badge>
                  </Td>
                  <Td className="space-x-2">
                    <Button variant="secondary" onClick={() => openPayModal(c)}>
                      Realizar pago
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <Modal open={openNew} onClose={() => setOpenNew(false)} title="Nueva liquidación">
        <form className="space-y-4" onSubmit={handleNewSettlement}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">Mes</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={newMonth}
                onChange={(e) => setNewMonth(Number(e.target.value))}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Año"
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(Number(e.target.value))}
              required
            />
            <Input
              label="Gasto total del mes"
              type="number"
              min="0"
              step="0.01"
              value={totalExpense}
              onChange={(e) => setTotalExpense(e.target.value)}
              required
            />
            <Input
              label="Recargo morosos (%)"
              type="number"
              min="0"
              step="0.1"
              value={lateFeePercentage}
              onChange={(e) => setLateFeePercentage(e.target.value)}
              required
            />
            <Input
              label="1er vencimiento"
              type="date"
              value={dueDate1}
              onChange={(e) => setDueDate1(e.target.value)}
            />
            <Input
              label="2do vencimiento"
              type="date"
              value={dueDate2}
              onChange={(e) => setDueDate2(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpenNew(false)}>
              Cancelar
            </Button>
            <Button type="submit">Crear</Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar liquidación">
        {settlement ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!settlement) return;
              setDeleteLoading(true);
              const res = await fetch(`/api/buildings/${buildingId}/settlements`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settlementId: settlement.id, password: deletePassword }),
              });
              if (res.ok) {
                toast.success("Liquidación eliminada");
                setDeleteOpen(false);
                setDeletePassword("");
                setDeleteLoading(false);
                loadData();
              } else {
                const body = await res.json().catch(() => ({}));
                toast.error(body.message ?? "No pudimos eliminar la liquidación");
                setDeleteLoading(false);
              }
            }}
          >
            <p className="text-sm text-slate-600">
              Estás a punto de eliminar la liquidación {settlement.month}/{settlement.year}. Esta acción es permanente.
              Confirma ingresando tu contraseña de administrador.
            </p>
            <Input
              label="Contraseña"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" loading={deleteLoading}>
                Eliminar
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">No hay liquidación seleccionada.</p>
        )}
      </Modal>

      <Modal
        open={openPayment}
        onClose={closePaymentModal}
        title={`Registrar pago ${selectedCharge?.unitCode ?? ""}`}
      >
        <form className="space-y-4" onSubmit={handlePayment}>
          <Input label="Monto a pagar" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          {paymentPreview?.discountActive && (
            <p className="text-xs text-emerald-600">
              Incluye {discountLabel} de descuento por pago dentro del primer vencimiento.
            </p>
          )}
          <Input label="Número de recibo" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} required />
          <Input label="Fecha de pago" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          {creditSyncing && (
            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
              Aplicando saldo a favor disponible...
            </div>
          )}
          {!creditSyncing && creditPreview && (
            <CreditUsageDetails summary={creditPreview} />
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={closePaymentModal}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creditSyncing}>
              Confirmar pago
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="Estado de cuenta">
        {accountData ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Unidad {accountData.unit.code} · Responsable {accountData.unit.responsable ?? "N/D"}
              </p>
              <p className="text-xs text-slate-500">{accountData.unit.building}</p>
            </div>
            <div className="max-h-96 space-y-3 overflow-auto">
              {accountData.periods.map((p) => (
                <div key={p.settlementId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">
                      {p.month}/{p.year}
                    </div>
                    <Badge variant={statusColor(p.status)}>{p.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                    <span>Saldo anterior: {formatCurrency(p.previousBalance)}</span>
                    <span>Expensa mes: {formatCurrency(p.currentFee)}</span>
                    <span>Pagos parciales: {formatCurrency(p.partialPaymentsTotal)}</span>
                    <span className="font-semibold text-slate-900">
                      Total: {formatCurrency(p.totalToPay)}
                    </span>
                  </div>
                  {p.payments.length > 0 && (
                    <div className="mt-2 text-sm text-slate-600">
                      Pagos:
                      <ul className="list-disc pl-5">
                        {p.payments.map((pay) => (
                          <li key={pay.id} className="flex flex-wrap items-center gap-2">
                            <span>
                              {new Date(pay.paymentDate).toLocaleDateString("es-AR")} · {formatCurrency(pay.amount)} · Recibo{" "}
                              {pay.receiptNumber}
                            </span>
                            {pay.status === "CANCELLED" && (
                              <Badge variant="danger">Anulado</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Cargando...</p>
        )}
      </Modal>
    </div>
  );
}

function CreditUsageDetails({ summary }: { summary: CreditUsageSummary }) {
  const creditUsage = summary.appliedToMorosos + summary.appliedToUpcomingSettlements;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
      <p className="mb-1 font-semibold text-slate-900">Saldo a favor aplicado automáticamente</p>
      <div className="grid gap-1 text-xs text-slate-700 md:grid-cols-2">
        <span>Aplicado a morosos: {formatCurrency(summary.appliedToMorosos)}</span>
        <span>
          Aplicado a liquidaciones: {formatCurrency(summary.appliedToUpcomingSettlements)}
        </span>
        <span>Saldo disponible después: {formatCurrency(summary.creditBalance)}</span>
        <span>Total usado: {formatCurrency(creditUsage)}</span>
      </div>
      {summary.upcomingSettlementAllocations.length > 0 && (
        <div className="mt-2 text-xs text-slate-600">
          <p className="font-semibold uppercase text-slate-500">Adelantos aplicados</p>
          <div className="space-y-1">
            {summary.upcomingSettlementAllocations.map((alloc) => (
              <div key={`credit-preview-${alloc.chargeId}`} className="rounded border border-dashed border-slate-200 p-2">
                <div className="flex justify-between">
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
}

function CreditUsageAlert({
  summary,
  onClose,
}: {
  summary: CreditUsageSummary;
  onClose: () => void;
}) {
  const creditUsage = summary.appliedToMorosos + summary.appliedToUpcomingSettlements;
  const hasNewCredit = summary.excedente > 0.0009;
  const hasUsage = creditUsage > 0.0009;
  const tone = hasNewCredit
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : hasUsage
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : "border-slate-200 bg-slate-50 text-slate-900";
  const headline = hasNewCredit
    ? `Saldo a favor generado: ${formatCurrency(summary.excedente)}`
    : hasUsage
      ? `Saldo a favor aplicado: ${formatCurrency(creditUsage)}`
      : "El saldo a favor se mantiene sin cambios";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{headline}</p>
          <p>
            Aplicado a liquidación actual: {formatCurrency(summary.appliedToCurrent)} · Saldo disponible:{" "}
            <span className="font-semibold">{formatCurrency(summary.creditBalance)}</span>
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Ocultar
        </Button>
      </div>
      <div className="mt-3 grid gap-1 text-slate-700 md:grid-cols-2">
        <span>Excedente generado: {formatCurrency(summary.excedente)}</span>
        <span>Aplicado a morosos: {formatCurrency(summary.appliedToMorosos)}</span>
        <span>
          Aplicado a futuras liquidaciones: {formatCurrency(summary.appliedToUpcomingSettlements)}
        </span>
        <span>Saldo moroso previo: {formatCurrency(summary.morosoPrevio)}</span>
        <span>Saldo moroso final: {formatCurrency(summary.morosoFinal)}</span>
      </div>
      {summary.upcomingSettlementAllocations.length > 0 && (
        <div className="mt-3 text-xs text-slate-700">
          <p className="font-semibold uppercase text-slate-500">Adelantos aplicados</p>
          <div className="space-y-1">
            {summary.upcomingSettlementAllocations.map((alloc) => (
              <div
                key={`credit-allocation-${alloc.chargeId}`}
                className="rounded border border-dashed border-slate-200 p-2"
              >
                <div className="flex justify-between">
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
}

function CoverageNotice({ value, uncovered }: { value: number; uncovered: number }) {
  const rounded = Math.round(value * 1000) / 1000;
  const difference = Math.round((rounded - 100) * 1000) / 1000;
  if (Math.abs(difference) < 0.001) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Porcentajes asignados: <span className="font-semibold">{rounded}%</span>. El gasto del mes se reparte correctamente.
      </div>
    );
  }

  const isShort = difference < 0;
  const tone =
    difference < 0
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  const label = isShort
    ? `Faltan asignar ${Math.abs(difference)}% para cubrir el 100% del gasto mensual. Monto no cubierto: ${formatCurrency(Math.max(uncovered, 0))}.`
    : `Los porcentajes superan el 100% en ${Math.abs(difference)}%. Ajusta las unidades antes de generar la liquidación.`;

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ${tone}`}>
      Porcentajes asignados: <span className="font-semibold">{rounded}%</span>. {label}
    </div>
  );
}
