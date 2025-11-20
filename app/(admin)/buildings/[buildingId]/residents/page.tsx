"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Table, THead, Th, TBody, Tr, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ResidentRow = {
  id: number;
  code: string;
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

const emptyContact = (): ContactForm => ({
  fullName: "",
  dni: "",
  phone: "",
  address: "",
});

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
  const [unitCode, setUnitCode] = useState("");
  const [percentage, setPercentage] = useState("");
  const [inquilino, setInquilino] = useState<ContactForm>(emptyContact());
  const [responsable, setResponsable] = useState<ContactForm>(emptyContact());
  const [propietario, setPropietario] = useState<ContactForm>(emptyContact());
  const [inmobiliaria, setInmobiliaria] = useState<ContactForm>(emptyContact());

  const fetchResidents = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/buildings/${buildingId}/residents?search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`,
    );
    if (res.ok) {
      const body = await res.json();
      setData(body.data);
      setTotal(body.total);
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
    if (!unitCode || !percentage) {
      toast.error("Unidad y porcentaje son obligatorios");
      setLoading(false);
      return;
    }
    if (!responsable.fullName || !responsable.phone) {
      toast.error("Responsable de pago requiere nombre y celular");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buildingId,
        code: unitCode,
        percentage: Number(percentage),
        contacts: { inquilino, responsable, propietario, inmobiliaria },
      }),
    });
    if (res.ok) {
      toast.success("Residente registrado");
      setOpen(false);
      setUnitCode("");
      setPercentage("");
      setInquilino(emptyContact());
      setResponsable(emptyContact());
      setPropietario(emptyContact());
      setInmobiliaria(emptyContact());
      fetchResidents();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "Error al guardar");
    }
    setLoading(false);
  };

  const pages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Residentes</h2>
          <p className="text-sm text-slate-500">
            Unidades, responsables de pago y porcentajes.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Registrar nuevo residente</Button>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Buscar por unidad o responsable"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Unidad</Th>
            <Th>Responsable de pago</Th>
            <Th className="text-right">Porcentaje</Th>
            <Th>Estado de cuenta</Th>
          </tr>
        </THead>
        <TBody>
          {loading && (
            <Tr>
              <Td colSpan={4}>Cargando datos...</Td>
            </Tr>
          )}
          {!loading && data.length === 0 && (
            <Tr>
              <Td colSpan={4}>
                <div className="flex flex-col gap-2">
                  <span className="text-slate-500">
                    Este edificio aun no tiene residentes cargados.
                  </span>
                  <Button onClick={() => setOpen(true)}>Registrar primer residente</Button>
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
                  {row.accountStatus === "ON_TIME" ? "Al dia" : "Deuda pendiente"}
                </Badge>
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

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar nuevo residente">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
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
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              required
            />
          </div>

          <ContactBlock
            title="Inquilino"
            contact={inquilino}
            onChange={setInquilino}
          />
          <ContactBlock
            title="Responsable de pago"
            required
            contact={responsable}
            onChange={setResponsable}
          />
          <ContactBlock
            title="Propietario"
            contact={propietario}
            onChange={setPropietario}
          />
          <ContactBlock
            title="Inmobiliaria"
            contact={inmobiliaria}
            onChange={setInmobiliaria}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
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
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {required && <span className="text-xs text-red-500">Obligatorio nombre + celular</span>}
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
