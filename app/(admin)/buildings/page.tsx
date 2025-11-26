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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const openDeleteModal = (building: Building) => {
    setSelectedBuilding(building);
    setDeletePassword("");
    setDeleteOpen(true);
  };

  const closeDeleteModal = (force = false) => {
    if (deleteLoading && !force) return;
    setDeleteOpen(false);
    setSelectedBuilding(null);
    setDeletePassword("");
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuilding) return;
    setDeleteLoading(true);
    const res = await fetch("/api/buildings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingId: selectedBuilding.id, password: deletePassword }),
    });
    if (res.ok) {
      toast.success("Edificio eliminado");
      setBuildings((prev) => prev.filter((b) => b.id !== selectedBuilding.id));
      setDeleteLoading(false);
      closeDeleteModal(true);
      return;
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? "Error al eliminar edificio");
    }
    setDeleteLoading(false);
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
            <Card className="relative h-full p-5">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDeleteModal(b);
                }}
                className="absolute right-4 top-4 inline-flex items-center rounded-md border border-rose-100 bg-white/80 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
                aria-label={`Eliminar ${b.name}`}
              >
                Eliminar
              </button>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{b.name}</h3>
                  <p className="text-sm text-slate-500">{b.address}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <p>Liquidaciones: {b._count?.settlements ?? 0}</p>
                <span className="font-semibold text-slate-900">Ingresar</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Unidades: <span className="font-semibold text-slate-900">{b._count?.units ?? 0}</span>
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

      <Modal open={deleteOpen} onClose={closeDeleteModal} title="Eliminar edificio">
        {selectedBuilding ? (
          <form className="space-y-4" onSubmit={handleDelete}>
            <p className="text-sm text-slate-600">
              Estás a punto de eliminar <span className="font-semibold text-slate-900">{selectedBuilding.name}</span>.
              Esta acción no se puede deshacer y eliminará todas sus unidades y registros asociados.
              Confirma ingresando tu contraseña.
            </p>
            <Input
              label="Contraseña"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="danger" loading={deleteLoading}>
                Eliminar
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un edificio para eliminarlo.</p>
        )}
      </Modal>
    </div>
  );
}
