"use client";
import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({ open, title, onClose, children, width = "680px" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; width?: string }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
