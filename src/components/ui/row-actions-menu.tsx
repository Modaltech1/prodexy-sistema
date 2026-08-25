"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Ellipsis } from "lucide-react";

export interface RowAction {
  label: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  tone?: "default" | "danger";
}

interface MenuPosition {
  top: number;
  left: number;
}

export function RowActionsMenu({ actions, label = "Abrir opções" }: { actions: RowAction[]; label?: string }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const close = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const open = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 208;
    const menuHeight = actions.length * 38 + 10;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + menuHeight <= window.innerHeight - 8
      ? preferredTop
      : Math.max(8, rect.top - menuHeight - 6);
    setPosition({ top, left });
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    });
  };

  const toggle = () => position ? close() : open();

  useEffect(() => {
    if (!position) return;
    const closeOnViewportChange = () => setPosition(null);
    window.addEventListener("resize", closeOnViewportChange);
    return () => window.removeEventListener("resize", closeOnViewportChange);
  }, [position]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div className="row-actions">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button row-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-controls={position ? menuId : undefined}
        title="Opções"
        onClick={toggle}
      >
        <Ellipsis size={17} />
      </button>
      {position && createPortal(
        <>
          <div className="row-actions-backdrop" aria-hidden="true" onClick={() => close()} onWheel={() => close()} />
          <div
            ref={menuRef}
            id={menuId}
            className="row-actions-menu"
            role="menu"
            style={{ top: position.top, left: position.left }}
            onKeyDown={handleMenuKeyDown}
          >
            {actions.map((action) => action.href ? (
              <Link
                key={action.label}
                href={action.href}
                role="menuitem"
                className={`row-actions-item ${action.tone === "danger" ? "danger" : ""} ${action.disabled ? "disabled" : ""}`}
                aria-disabled={action.disabled || undefined}
                tabIndex={action.disabled ? -1 : 0}
                onClick={(event) => {
                  if (action.disabled) event.preventDefault();
                  else close();
                }}
              >
                {action.icon}<span>{action.label}</span>
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={`row-actions-item ${action.tone === "danger" ? "danger" : ""}`}
                aria-disabled={action.disabled || undefined}
                disabled={action.disabled}
                onClick={() => {
                  close();
                  void action.onSelect?.();
                }}
              >
                {action.icon}<span>{action.label}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
