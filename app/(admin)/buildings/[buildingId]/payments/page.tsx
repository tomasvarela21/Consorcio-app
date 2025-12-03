"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/format";

type PaymentRow = {
  id: number;
  amount: number;
  receiptNumber: string;
  paymentDate: string;
  settlement: { month: number; year: number };
  unit: { id: number; code: string; building: string };
  responsible: string;
  status: "COMPLETED" | "CANCELLED";
  canceledAt: string | null;
};

export default function PaymentsPage() {
  const params = useParams<{ buildingId: string }>();
  const buildingId = Number(params.buildingId);
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [unitCode, setUnitCode] = useState("");
  const [responsible, setResponsible] = useState("");
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [responsibleOptions, setResponsibleOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [openDetail, setOpenDetail] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PaymentRow | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const fetchPayments = async () => {
    setLoading(true);
    const query = new URLSearchParams({
      buildingId: buildingId.toString(),
      month,
      year,
      unitCode,
      responsible,
    });
    const res = await fetch(`/api/payments/history?${query.toString()}`);
    if (res.ok) {
      const list: PaymentRow[] = await res.json();
      setRows(list);
      setUnitOptions(
        Array.from(new Set(list.map((p) => p.unit.code).filter(Boolean))).sort(),
      );
      setResponsibleOptions(
        Array.from(new Set(list.map((p) => p.responsible).filter(Boolean))).sort(),
      );
    } else {
      toast.error("No pudimos cargar pagos");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPayments();
  }, [buildingId]);

  const openDetailModal = (payment: PaymentRow) => {
    setSelected(payment);
    setOpenDetail(true);
  };

  const openCancelModal = (payment: PaymentRow) => {
    setCancelTarget(payment);
    setCancelModalOpen(true);
  };

  const cancelPayment = async () => {
    if (!cancelTarget || cancelTarget.status === "CANCELLED") {
      return;
    }
    setCancellingId(cancelTarget.id);
    const res = await fetch(`/api/payments/${cancelTarget.id}`, {
      method: "PATCH",
    });
    if (res.ok) {
      toast.success("Pago anulado correctamente");
      await fetchPayments();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "No se pudo anular el pago");
    }
    setCancellingId(null);
    setCancelModalOpen(false);
    setCancelTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Pagos</h2>
          <p className="text-sm text-slate-500">Historial de pagos del edificio.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col text-xs font-semibold text-slate-600">
            <label>Mes</label>
            <select
              className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="">Todos</option>
              {Array.from({ length: 12 }, (_v, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-xs font-semibold text-slate-600">
            <label>Año</label>
            <select
              className="h-9 w-28 rounded-md border border-slate-300 px-2 text-sm"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">Todos</option>
              {[-1, 0, 1].map((offset) => {
                const y = new Date().getFullYear() + offset;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex flex-col text-xs font-semibold text-slate-600">
            <label>Unidad</label>
            <select
              className="h-9 w-36 rounded-md border border-slate-300 px-2 text-sm"
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
            >
              <option value="">Todas</option>
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-xs font-semibold text-slate-600">
            <label>Responsable</label>
            <select
              className="h-9 w-44 rounded-md border border-slate-300 px-2 text-sm"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            >
              <option value="">Todos</option>
              {responsibleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={fetchPayments} className="h-9">
            Aplicar filtros
          </Button>
        </div>
      </div>

      <Table viewportClassName="max-h-[65vh] overflow-y-auto">
        <THead>
          <tr>
            <Th>Fecha de pago</Th>
            <Th>Responsable</Th>
            <Th>Unidad</Th>
            <Th>Recibo</Th>
            <Th>Período</Th>
            <Th>Estado</Th>
            <Th className="text-right">Monto</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <TBody>
          {loading && (
            <Tr>
              <Td colSpan={8}>Cargando pagos...</Td>
            </Tr>
          )}
          {!loading && rows.length === 0 && (
            <Tr>
              <Td colSpan={8} className="text-slate-500">
                Todavía no se registraron pagos para este edificio.
              </Td>
            </Tr>
          )}
          {rows.map((p) => (
            <Tr key={p.id}>
              <Td>{new Date(p.paymentDate).toLocaleDateString("es-AR")}</Td>
              <Td>{p.responsible}</Td>
              <Td>{p.unit.code}</Td>
              <Td>{p.receiptNumber}</Td>
              <Td>
                {p.settlement.month}/{p.settlement.year}
              </Td>
              <Td>
                <Badge variant={p.status === "CANCELLED" ? "danger" : "success"}>
                  {p.status === "CANCELLED" ? "Anulado" : "Confirmado"}
                </Badge>
                {p.status === "CANCELLED" && p.canceledAt && (
                  <p className="text-[11px] text-slate-500">
                    {new Date(p.canceledAt).toLocaleDateString("es-AR")}
                  </p>
                )}
              </Td>
              <Td className="text-right font-semibold">{formatCurrency(p.amount)}</Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => openDetailModal(p)}>
                    Ver detalle
                  </Button>
                  {p.status === "COMPLETED" && (
                    <Button
                      variant="danger"
                      loading={cancellingId === p.id}
                      onClick={() => openCancelModal(p)}
                    >
                      Anular pago
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Modal
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        title="Detalle de pago"
        footer={
          <div className="flex justify-end gap-2">
            {selected?.status === "COMPLETED" && (
              <Button
                variant="secondary"
                onClick={() =>
                  window.open(`/api/pdf/receipt/${selected.id}`, "_blank")
                }
              >
                Descargar recibo
              </Button>
            )}
            <Button variant="primary" onClick={() => setOpenDetail(false)}>
              Cerrar
            </Button>
          </div>
        }
      >
        {selected ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Fecha:</span>{" "}
              {new Date(selected.paymentDate).toLocaleDateString("es-AR")}
            </p>
            <p>
              <span className="font-semibold">Responsable:</span> {selected.responsible}
            </p>
            <p>
              <span className="font-semibold">Unidad:</span> {selected.unit.code}
            </p>
            <p>
              <span className="font-semibold">Período:</span> {selected.settlement.month}/{selected.settlement.year}
            </p>
            <p>
              <span className="font-semibold">Recibo:</span> {selected.receiptNumber}
            </p>
            <p>
              <span className="font-semibold">Monto:</span> {formatCurrency(selected.amount)}
            </p>
            <p className="flex items-center gap-2">
              <span className="font-semibold">Estado:</span>
              <Badge variant={selected.status === "CANCELLED" ? "danger" : "success"}>
                {selected.status === "CANCELLED" ? "Anulado" : "Confirmado"}
              </Badge>
            </p>
            {selected.status === "CANCELLED" && selected.canceledAt && (
              <p className="text-xs text-slate-500">
                Anulado el {new Date(selected.canceledAt).toLocaleDateString("es-AR")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un pago para ver el detalle.</p>
        )}
      </Modal>

      <Modal
        open={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false);
          setCancelTarget(null);
        }}
        title="Anular pago"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setCancelModalOpen(false);
                setCancelTarget(null);
              }}
            >
              Mantener pago
            </Button>
            <Button
              variant="danger"
              loading={cancellingId === cancelTarget?.id}
              onClick={cancelPayment}
            >
              Confirmar anulación
            </Button>
          </div>
        }
      >
        {cancelTarget ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Estás por anular el pago{" "}
              <span className="font-semibold">{cancelTarget.receiptNumber}</span>.
            </p>
            <p>
              Unidad: <span className="font-semibold">{cancelTarget.unit.code}</span>
            </p>
            <p>
              Responsable:{" "}
              <span className="font-semibold">{cancelTarget.responsible}</span>
            </p>
            <p>
              Monto: <span className="font-semibold">{formatCurrency(cancelTarget.amount)}</span>
            </p>
            <p className="text-xs text-slate-500">
              El importe volverá a las liquidaciones correspondientes y quedará
              registro de que el pago fue anulado.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un pago para anular.</p>
        )}
      </Modal>
    </div>
  );
}
