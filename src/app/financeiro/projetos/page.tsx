"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { LoadingBlock } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/client-api";
import { currentCompetence } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/money";
import type { FinancialDashboardData, FinancialProjectComparisonData, ProjectFinancialSummary } from "@/lib/types";

type ComparisonPeriod = "month" | "full_cycle";
type ComparisonResponse = {
  key: string;
  projects?: ProjectFinancialSummary[];
  cycleRange?: { start: string | null; end: string };
  error?: string;
};

export default function FinancialProjectsPage() {
  const [period, setPeriod] = useState<ComparisonPeriod>("month");
  const [month, setMonth] = useState(currentCompetence().slice(0, 7));
  const requestKey = `${period}:${month}`;
  const [response, setResponse] = useState<ComparisonResponse | null>(null);

  useEffect(() => {
    let active = true;
    const request = period === "month"
      ? apiFetch<FinancialDashboardData>(`/api/dashboard?month=${month}`)
      : apiFetch<FinancialProjectComparisonData>("/api/financial-projects");

    request
      .then((result) => {
        if (!active) return;
        setResponse({
          key: requestKey,
          projects: result.project_summaries,
          cycleRange: "period" in result ? { start: result.start_month, end: result.end_month } : undefined,
        });
      })
      .catch((error: unknown) => {
        if (active) setResponse({ key: requestKey, error: error instanceof Error ? error.message : "Não foi possível carregar a comparação." });
      });
    return () => { active = false; };
  }, [month, period, requestKey]);

  const currentResponse = response?.key === requestKey ? response : null;
  const projects = currentResponse?.projects ?? [];
  const cycleRange = currentResponse?.cycleRange ?? null;
  const loading = !currentResponse;

  const invalidParticipation = projects.some((project) => project.participation_valid === false);

  return (
    <>
      <PageHeader title="Comparação financeira dos projetos" description="Compare rentabilidade, custos, margens e a parcela que efetivamente pertence à Prodexy." />

      <div className="finance-context-bar comparison-context-bar">
        <div className="field comparison-period-field">
          <label>Período</label>
          <div className="period-switch" role="group" aria-label="Período da comparação">
            <button type="button" className={`segmented-button ${period === "month" ? "active" : ""}`} onClick={() => setPeriod("month")}>Competência</button>
            <button type="button" className={`segmented-button ${period === "full_cycle" ? "active" : ""}`} onClick={() => setPeriod("full_cycle")}>Ciclo completo</button>
          </div>
        </div>
        {period === "month" && (
          <div className="field comparison-month-field">
            <label>Competência</label>
            <input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
        )}
        <p className="finance-context-copy">
          {period === "month" ? "Compara somente o resultado econômico da competência selecionada." : formatCycleRange(cycleRange)}
        </p>
      </div>

      {invalidParticipation && !loading && (
        <div className="warning-box finance-notice">
          <AlertTriangle size={15} /> Há competências abertas com composição societária inválida. Corrija as participações para confirmar a parcela da Prodexy.
        </div>
      )}

      {currentResponse?.error ? (
        <div className="error-box">{currentResponse.error}</div>
      ) : loading ? (
        <LoadingBlock lines={7} />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead><tr><th>Projeto</th><th className="numeric">Bruto</th><th className="numeric">Taxas</th><th className="numeric">Líquido</th><th className="numeric">Custo direto</th><th className="numeric">Rateio</th><th className="numeric">Lucro</th><th className="numeric">Margem</th><th className="numeric">Parte Prodexy</th></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.project_id}>
                  <td><Link className="table-link" href={`/projetos/${project.project_id}`}>{project.project_name}</Link></td>
                  <td className="numeric">{formatMoney(project.revenue_gross_cents)}</td>
                  <td className="numeric">{formatMoney(project.revenue_fees_cents)}</td>
                  <td className="numeric">{formatMoney(project.revenue_net_cents)}</td>
                  <td className="numeric">{formatMoney(project.direct_costs_cents)}</td>
                  <td className="numeric">{formatMoney(project.shared_costs_cents)}</td>
                  <td className={`numeric ${project.profit_cents < 0 ? "negative" : ""}`}>{formatMoney(project.profit_cents)}</td>
                  <td className="numeric">{project.margin_percentage == null ? "—" : formatPercent(project.margin_percentage)}</td>
                  <td className="numeric"><strong>{formatMoney(project.prodexy_share_cents)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function formatCycleRange(range: { start: string | null; end: string } | null) {
  if (!range?.start) return "Acumulado de todo o histórico financeiro disponível.";
  const formatMonth = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`));
  return `Acumulado de ${formatMonth(range.start)} até ${formatMonth(range.end)}.`;
}
