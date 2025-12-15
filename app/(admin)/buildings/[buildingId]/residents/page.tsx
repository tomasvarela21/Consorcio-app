"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { compareUnitCodes } from "@/lib/sort";
import { formatCurrency } from "@/lib/format";

type ResidentRow = {
  id: number;
  code: string;
  padron?: string | null;
  responsible: string | null;
  percentage: number;
  accountStatus: string;
};

type ContactForm = {
  fullName: string;
  dni: string;
  phone: string;
  address: string;
};

type CreditMovementEntry = {
  id: number;
  type: "CREDIT" | "DEBIT";
  amount: number;
  description: string;
  createdAt: string;
  settlement?: { month: number; year: number } | null;
  payment?: { id: number; receiptNumber: string | null } | null;
};

type CreditLedger = {
  balance: number;
  movements: CreditMovementEntry[];
};

type RoleKey = "INQUILINO" | "RESPONSABLE" | "PROPIETARIO" | "INMOBILIARIA";

const emptyContact = (): ContactForm => ({
  fullName: "",
  dni: "",
  phone: "",
  address: "",
});

const ROLE_TABS: { key: RoleKey; label: string }[] = [
  { key: "RESPONSABLE", label: "Responsable de pago" },
  { key: "PROPIETARIO", label: "Propietario" },
  { key: "INQUILINO", label: "Inquilino" },
  { key: "INMOBILIARIA", label: "Inmobiliaria" },
];

const PADRON_REGEX = /^[A-Za-z0-9-]+$/;
const COVERAGE_LIMIT = 100;
const COVERAGE_EPSILON = 0.0001;

export default function ResidentsPage() {
  const params = useParams<{ buildingId: string }>();
  const buildingId = Number(params.buildingId);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [data, setData] = useState<ResidentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [unitCode, setUnitCode] = useState("");
  const [padron, setPadron] = useState("");
  const [percentage, setPercentage] = useState("");
  const [percentageCoverage, setPercentageCoverage] = useState(0);
  const [creditLedger, setCreditLedger] = useState<CreditLedger | null>(null);
  const [creditLedgerLoading, setCreditLedgerLoading] = useState(false);

  const [inquilino, setInquilino] = useState<ContactForm>(emptyContact());
  const [responsable, setResponsable] = useState<ContactForm>(emptyContact());
  const [propietario, setPropietario] = useState<ContactForm>(emptyContact());
  const [inmobiliaria, setInmobiliaria] = useState<ContactForm>(emptyContact());

  // pestañas activas para cada modal
  const [createActiveTab, setCreateActiveTab] = useState<RoleKey>("RESPONSABLE");
  const [editActiveTab, setEditActiveTab] = useState<RoleKey>("RESPONSABLE");

  const normalizedPadron = padron.trim();
  const padronInputError =
    normalizedPadron.length === 0
      ? "Completar padrón (importante)"
      : !PADRON_REGEX.test(normalizedPadron)
        ? "Solo letras, números y guiones"
        : undefined;

  const fetchResidents = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/buildings/${buildingId}/residents?search=${encodeURIComponent(
        search,
      )}&page=${page}&pageSize=${pageSize}`,
    );
    if (res.ok) {
      const body = await res.json();
      const sorted = Array.isArray(body.data)
        ? [...body.data].sort((a: ResidentRow, b: ResidentRow) =>
            compareUnitCodes(a.code, b.code),
          )
        : [];
      setData(sorted);
      setTotal(body.total);
      setPercentageCoverage(body.percentageSum ?? 0);
    } else {
      toast.error("No pudimos cargar residentes");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchResidents();
  }, [search, page, buildingId, pageSize]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const padronClean = padron.trim();
    const percentageValue = Number(percentage);
    if (!unitCode || !percentage) {
      toast.error("Unidad y porcentaje son obligatorios");
      setLoading(false);
      return;
    }
    if (Number.isNaN(percentageValue)) {
      toast.error("Ingresa un porcentaje válido");
      setLoading(false);
      return;
    }
    if (!responsable.fullName || !responsable.phone) {
      toast.error("Responsable de pago requiere nombre y celular");
      setLoading(false);
      return;
    }
    if (padronClean && !PADRON_REGEX.test(padronClean)) {
      toast.error("El padrón solo acepta letras, números o guiones");
      setLoading(false);
      return;
    }
    const projectedCoverage = percentageCoverage + percentageValue;
    if (projectedCoverage > COVERAGE_LIMIT + COVERAGE_EPSILON) {
      toast.error("La suma de porcentajes superaría el 100%. Ajusta otras unidades antes de continuar.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buildingId,
        code: unitCode,
        percentage: percentageValue,
        padron: padronClean || null,
        contacts: { inquilino, responsable, propietario, inmobiliaria },
      }),
    });
    if (res.ok) {
      toast.success("Residente registrado");
      setOpen(false);
      setUnitCode("");
      setPadron("");
      setPercentage("");
      setInquilino(emptyContact());
      setResponsable(emptyContact());
      setPropietario(emptyContact());
      setInmobiliaria(emptyContact());
      setCreateActiveTab("RESPONSABLE");
      fetchResidents();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "Error al guardar");
    }
    setLoading(false);
  };

  const pages = Math.ceil(total / pageSize);

  const loadCreditLedger = async (unitId: number) => {
    setCreditLedger(null);
    setCreditLedgerLoading(true);
    try {
      const res = await fetch(`/api/units/${unitId}/credit-movements`);
      if (res.ok) {
        const body = await res.json();
        const movements: CreditMovementEntry[] = Array.isArray(body.movements)
          ? body.movements.map((m: any) => ({
              id: m.id,
              type: m.type === "DEBIT" ? "DEBIT" : "CREDIT",
              amount: Number(m.amount ?? 0),
              description: m.description ?? "",
              createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date().toISOString(),
              settlement: m.settlement
                ? { month: Number(m.settlement.month), year: Number(m.settlement.year) }
                : null,
              payment: m.payment
                ? {
                    id: m.payment.id,
                    receiptNumber: m.payment.receiptNumber ?? null,
                  }
                : null,
            }))
          : [];
        setCreditLedger({
          balance: Number(body.balance ?? 0),
          movements,
        });
      } else {
        setCreditLedger(null);
        toast.error("No pudimos cargar el estado de saldo a favor");
      }
    } catch (_err) {
      setCreditLedger(null);
      toast.error("No pudimos cargar el estado de saldo a favor");
    } finally {
      setCreditLedgerLoading(false);
    }
  };

  const openView = async (unitId: number) => {
    const res = await fetch(`/api/units/${unitId}`);
    if (res.ok) {
      const payload = await res.json();
      setSelected(payload);
      setOpenDetail(true);
      loadCreditLedger(unitId);
    } else {
      toast.error("No pudimos cargar el residente");
    }
  };

  const openEditModal = async (unitId: number) => {
    const res = await fetch(`/api/units/${unitId}`);
    if (res.ok) {
      const payload = await res.json();
      setSelected(payload);
      setUnitCode(payload.code);
      setPadron(payload.padron ?? "");
      setPercentage(String(payload.percentage));
      const toForm = (role: string) => {
        const c = payload.contacts.find((ct: any) => ct.role === role);
        return c
          ? {
              fullName: c.fullName ?? "",
              dni: c.dni ?? "",
              phone: c.phone ?? "",
              address: c.address ?? "",
            }
          : emptyContact();
      };
      setInquilino(toForm("INQUILINO"));
      setResponsable(toForm("RESPONSABLE"));
      setPropietario(toForm("PROPIETARIO"));
      setInmobiliaria(toForm("INMOBILIARIA"));
      setEditActiveTab("RESPONSABLE");
      setOpenEdit(true);
    } else {
      toast.error("No pudimos cargar el residente");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    const padronClean = padron.trim();
    const percentageValue = Number(percentage);
    if (!unitCode || !percentage) {
      toast.error("Unidad y porcentaje son obligatorios");
      setLoading(false);
      return;
    }
    if (Number.isNaN(percentageValue)) {
      toast.error("Ingresa un porcentaje válido");
      setLoading(false);
      return;
    }
    if (!responsable.fullName || !responsable.phone) {
      toast.error("Responsable de pago requiere nombre y celular");
      setLoading(false);
      return;
    }
    if (padronClean && !PADRON_REGEX.test(padronClean)) {
      toast.error("El padrón solo acepta letras, números o guiones");
      setLoading(false);
      return;
    }
    const previousPercentage = Number(selected.percentage ?? 0);
    const projectedCoverage =
      percentageCoverage - previousPercentage + percentageValue;
    if (projectedCoverage > COVERAGE_LIMIT + COVERAGE_EPSILON) {
      toast.error("La suma de porcentajes superaría el 100%. Ajusta otras unidades antes de continuar.");
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/units/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: unitCode,
        percentage: percentageValue,
        padron: padronClean || null,
        contacts: { inquilino, responsable, propietario, inmobiliaria },
      }),
    });
    if (res.ok) {
      toast.success("Residente actualizado");
      setOpenEdit(false);
      fetchResidents();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "Error al actualizar");
    }
    setLoading(false);
  };

  // helper para obtener contacto y setter según pestaña
  const getContactByRole = (role: RoleKey): [ContactForm, (c: ContactForm) => void, boolean] => {
    switch (role) {
      case "INQUILINO":
        return [inquilino, setInquilino, false];
      case "PROPIETARIO":
        return [propietario, setPropietario, false];
      case "INMOBILIARIA":
        return [inmobiliaria, setInmobiliaria, false];
      case "RESPONSABLE":
      default:
        return [responsable, setResponsable, true]; // responsable es obligatorio
    }
  };

  const resetCreateForm = () => {
    setSelected(null);
    setUnitCode("");
    setPadron("");
    setPercentage("");
    setInquilino(emptyContact());
    setResponsable(emptyContact());
    setPropietario(emptyContact());
    setInmobiliaria(emptyContact());
    setCreateActiveTab("RESPONSABLE");
  };

  const openCreateModal = () => {
    resetCreateForm();
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Residentes</h2>
          <p className="text-sm text-slate-500">
            Unidades, responsables de pago y porcentajes.
          </p>
        </div>
        <Button onClick={openCreateModal}>Registrar nuevo residente</Button>
      </div>

      <PercentageCoverageAlert value={percentageCoverage} />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Buscar por unidad, padrón o responsable"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <Table viewportClassName="max-h-[65vh] overflow-y-auto">
        <THead>
          <tr>
            <Th>Unidad</Th>
            <Th>Responsable de pago</Th>
            <Th className="text-right">Porcentaje</Th>
            <Th>Estado de cuenta</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <TBody>
          {loading && (
            <Tr>
              <Td colSpan={5}>Cargando datos...</Td>
            </Tr>
          )}
          {!loading && data.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <div className="flex flex-col gap-2">
                  <span className="text-slate-500">
                    Este edificio aun no tiene residentes cargados.
                  </span>
                  <Button onClick={openCreateModal}>
                    Registrar primer residente
                  </Button>
                </div>
              </Td>
            </Tr>
          )}
          {data.map((row) => (
            <Tr key={row.id}>
              <Td className="font-semibold">{row.code}</Td>
              <Td>{row.responsible ?? "Sin responsable"}</Td>
              <Td className="text-right">{row.percentage}%</Td>
              <Td>
                <Badge
                  variant={row.accountStatus === "ON_TIME" ? "success" : "warning"}
                >
                  {row.accountStatus === "ON_TIME"
                    ? "Al dia"
                    : "Deuda pendiente"}
                </Badge>
              </Td>
              <Td className="space-x-2">
                <Button variant="secondary" onClick={() => openView(row.id)}>
                  Ver info
                </Button>
                <Button variant="ghost" onClick={() => openEditModal(row.id)}>
                  Editar
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-slate-600">
            Pagina {page} de {pages}
          </span>
          <Button
            variant="secondary"
            disabled={page === pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* MODAL CREAR */}
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar nuevo residente">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              label="Unidad (ej: A-1)"
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              required
            />
            <Input
              label="Porcentaje (%)"
              type="number"
              min="0"
              step="0.001"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              required
            />
            <Input
              label="Padrón"
              placeholder="AA-0000"
              value={padron}
              onChange={(e) => setPadron(e.target.value)}
              error={padronInputError}
            />
          </div>

          {/* Tabs contactos */}
          <div className="space-y-3">
            <div className="flex gap-4 border-b border-slate-200">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setCreateActiveTab(tab.key)}
                  className={[
                    "pb-2 text-sm font-medium transition",
                    createActiveTab === tab.key
                      ? "border-b-2 border-orange-500 text-slate-900"
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(() => {
              const [contact, setContact, isRequired] =
                getContactByRole(createActiveTab);
              return (
                <ContactBlock
                  title={
                    ROLE_TABS.find((t) => t.key === createActiveTab)?.label ??
                    ""
                  }
                  required={isRequired}
                  contact={contact}
                  onChange={setContact}
                />
              );
            })()}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL DETALLE */}
      <Modal
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        title="Información del residente"
      >
        {selected ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Unidad:</span> {selected.code}
            </p>
            <p>
              <span className="font-semibold">Padrón:</span>{" "}
              {selected.padron ? (
                selected.padron
              ) : (
                <span className="text-red-500">Sin padrón</span>
              )}
            </p>
            <p>
              <span className="font-semibold">Porcentaje:</span>{" "}
              {selected.percentage}%
            </p>
            <p>
              <span className="font-semibold">Estado:</span>{" "}
              {selected.accountStatus}
            </p>
            <p>
              <span className="font-semibold">Saldo a favor:</span>{" "}
              {formatCurrency(creditLedger?.balance ?? selected.creditBalance ?? 0)}
            </p>
            <div className="space-y-1">
              <p className="font-semibold">Contactos</p>
              {selected.contacts.map((c: any) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-200 p-2"
                >
                  <p className="text-xs uppercase text-slate-500">{c.role}</p>
                  <p>{c.fullName}</p>
                  {c.phone && <p className="text-slate-500">{c.phone}</p>}
                  {c.dni && (
                    <p className="text-slate-500">DNI/CUIT: {c.dni}</p>
                  )}
                  {c.address && <p className="text-slate-500">{c.address}</p>}
                </div>
              ))}
            </div>
            <CreditLedgerSection ledger={creditLedger} loading={creditLedgerLoading} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un residente.</p>
        )}
      </Modal>

      {/* MODAL EDITAR */}
      <Modal open={openEdit} onClose={() => setOpenEdit(false)} title="Editar residente">
        <form className="space-y-4" onSubmit={handleUpdate}>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              label="Unidad (ej: A-1)"
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              required
            />
            <Input
              label="Porcentaje (%)"
              type="number"
              min="0"
              step="0.001"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              required
            />
            <Input
              label="Padrón"
              placeholder="AA-0000"
              value={padron}
              onChange={(e) => setPadron(e.target.value)}
              error={padronInputError}
            />
          </div>

          {/* Tabs contactos */}
          <div className="space-y-3">
            <div className="flex gap-4 border-b border-slate-200">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setEditActiveTab(tab.key)}
                  className={[
                    "pb-2 text-sm font-medium transition",
                    editActiveTab === tab.key
                      ? "border-b-2 border-orange-500 text-slate-900"
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(() => {
              const [contact, setContact, isRequired] =
                getContactByRole(editActiveTab);
              return (
                <ContactBlock
                  title={
                    ROLE_TABS.find((t) => t.key === editActiveTab)?.label ?? ""
                  }
                  required={isRequired}
                  contact={contact}
                  onChange={setContact}
                />
              );
            })()}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setOpenEdit(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CreditLedgerSection({
  ledger,
  loading,
}: {
  ledger: CreditLedger | null;
  loading: boolean;
}) {
  const balance = ledger?.balance ?? 0;
  const movements = ledger?.movements ?? [];
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Estado de saldo a favor</p>
        <Badge variant={balance > 0 ? "success" : "default"}>
          {formatCurrency(balance)}
        </Badge>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Cargando movimientos...</p>
      ) : movements.length === 0 ? (
        <p className="text-sm text-slate-500">Sin movimientos registrados.</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-slate-100">
          <Table>
            <THead>
              <tr>
                <Th>Fecha</Th>
                <Th>Detalle</Th>
                <Th className="text-right">Importe</Th>
              </tr>
            </THead>
            <TBody>
              {movements.map((movement) => {
                const isCredit = movement.type === "CREDIT";
                const dateLabel = new Date(movement.createdAt).toLocaleDateString("es-AR");
                return (
                  <Tr key={movement.id}>
                    <Td>{dateLabel}</Td>
                    <Td>{movement.description}</Td>
                    <Td className={`text-right ${isCredit ? "text-emerald-600" : "text-rose-600"}`}>
                      {isCredit ? "+" : "-"}
                      {formatCurrency(movement.amount)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PercentageCoverageAlert({ value }: { value: number }) {
  const rounded = Math.round(value * 1000) / 1000;
  const difference = Math.round((rounded - 100) * 1000) / 1000;
  if (Math.abs(difference) < 0.001) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Cobertura porcentual total: <span className="font-semibold">{rounded}%</span>. Los gastos del período se distribuyen completamente.
      </div>
    );
  }

  const isShort = difference < 0;
  const tone =
    difference < 0
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  const label = isShort
    ? `Falta asignar ${Math.abs(difference)}% para cubrir el 100% del gasto mensual.`
    : `Los porcentajes superan el 100% en ${Math.abs(difference)}%. Ajusta las unidades para mantener un total exacto.`;

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ${tone}`}>
      Cobertura porcentual total: <span className="font-semibold">{rounded}%</span>. {label}
    </div>
  );
}

function ContactBlock({
  title,
  required,
  contact,
  onChange,
}: {
  title: string;
  required?: boolean;
  contact: ContactForm;
  onChange: (c: ContactForm) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {required && (
          <span className="text-xs text-red-500">
            Obligatorio nombre + celular
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="Nombre completo"
          value={contact.fullName}
          onChange={(e) => onChange({ ...contact, fullName: e.target.value })}
          required={required}
        />
        <Input
          label="DNI / CUIT"
          value={contact.dni}
          onChange={(e) => onChange({ ...contact, dni: e.target.value })}
        />
        <Input
          label="Celular / Telefono"
          value={contact.phone}
          onChange={(e) => onChange({ ...contact, phone: e.target.value })}
          required={required}
        />
        <Input
          label="Domicilio"
          value={contact.address}
          onChange={(e) => onChange({ ...contact, address: e.target.value })}
        />
      </div>
    </div>
  );
}
