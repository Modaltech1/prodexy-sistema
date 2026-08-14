"use client";

import Link from "next/link";
import { Handshake, Percent, RefreshCw, ShieldCheck, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SettingsSection = "fees" | "categories" | "partners" | "recurrences" | "accesses";

type SettingsItem = {
  id: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
};

const settingsItems: SettingsItem[] = [
  { id: "fees", label: "Taxas", description: "Perfis de cobrança", icon: Percent },
  { id: "categories", label: "Categorias", description: "Classificação financeira", icon: Tags },
  { id: "partners", label: "Sócios", description: "Participantes da operação", icon: Handshake },
  { id: "recurrences", label: "Recorrências", description: "Previsões automáticas", icon: RefreshCw },
  { id: "accesses", label: "Acessos", description: "Contas dos sócios", icon: ShieldCheck, href: "/configuracoes/acessos" },
];

export function SettingsNavigation({
  active,
  onSelect,
}: {
  active: SettingsSection;
  onSelect?: (section: SettingsSection) => void;
}) {
  return (
    <nav className="settings-navigation" aria-label="Seções de configurações">
      {settingsItems.map((item) => {
        const Icon = item.icon;
        const content = <><Icon size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span></>;
        const className = `settings-navigation-item ${active === item.id ? "active" : ""}`;

        if (item.id === "accesses") {
          return <Link className={className} href={item.href || "/configuracoes/acessos"} key={item.id}>{content}</Link>;
        }
        if (onSelect) {
          return <button className={className} type="button" onClick={() => onSelect(item.id)} key={item.id}>{content}</button>;
        }
        return <Link className={className} href={`/configuracoes#${item.id}`} key={item.id}>{content}</Link>;
      })}
    </nav>
  );
}
