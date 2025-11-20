"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import Link from "next/link";

type Building = {
  id: number;
  name: string;
  address: string;
  createdAt: string;
  _count?: { units: number; settlements: number };
};

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const loadBuildings = async () => {
    setLoading(true);
    const res = await fetch("/api/buildings");
    if (res.ok) {
      const data = await res.json();
      setBuildings(data);
    } else {
      toast.error("No pudimos cargar los edificios");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBuildings();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/buildings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address }),
    });
    if (res.ok) {
      toast.success("Edificio creado");
      const body = await res.json();
      setName("");
      setAddress("");
      setOpen(false);
      window.location.href = `/buildings/${body.id}`;
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "Error al crear");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Edificios</h1>
          <p className="text-sm text-slate-500">Gestiona tus consorcios y unidades.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Nuevo edificio</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {buildings.map((b) => (
          <Link key={b.id} href={`/buildings/${b.id}`} className="block transition hover:-translate-y-0.5 hover:shadow-md">
            <Card className="p-5 h-full">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{b.name}</h3>
                  <p className="text-sm text-slate-500">{b.address}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {b._count?.units ?? 0} unidades
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <p>Liquidaciones: {b._count?.settlements ?? 0}</p>
                <span className="font-semibold text-slate-900">Ingresar</span>
              </div>
            </Card>
          </Link>
        ))}
        {!loading && buildings.length === 0 && (
          <Card className="p-5 text-sm text-slate-500">
            Aún no hay edificios creados.
            <div className="mt-3">
              <Button onClick={() => setOpen(true)}>Crear primer edificio</Button>
            </div>
          </Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo edificio">
        <form className="space-y-4" onSubmit={handleCreate}>
          <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} required />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Crear</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
