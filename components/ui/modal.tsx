"use client";

import { useEffect } from "react";
import { Button } from "./button";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode | null;
};

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-10 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl md:max-w-2xl lg:max-w-3xl max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer !== undefined && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            {footer ?? (
              <Button variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
