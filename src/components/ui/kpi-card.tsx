import type { ReactNode } from "react";
export function KpiCard({ label, value, detail, tone = "neutral", icon }: { label: string; value: string; detail?: string; tone?: "neutral"|"positive"|"negative"|"warning"; icon?: ReactNode }) {
  return <div className={`kpi-card kpi-${tone}`}><div className="kpi-top"><span>{label}</span>{icon}</div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
