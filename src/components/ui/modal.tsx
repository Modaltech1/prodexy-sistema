"use client";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ open, title, onClose, children, width = "680px" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
