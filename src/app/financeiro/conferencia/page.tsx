"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FinancialYearChart, type MonthlyFinancialSummary } from "@/components/financial-year-chart";
import { LoadingBlock } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/client-api";
import { currentCompetence, formatDate, MONTHS_PT } from "@/lib/date";
import { isRevenueRecognized } from "@/lib/finance";
import { formatMoney, formatPercent } from "@/lib/money";
import type { FinancialTransaction } from "@/lib/types";
import { useLookups } from "@/lib/use-lookups";

interface SharedCostAllocation {
  transaction_id: string;
  project_id: string;
  allocated_amount_cents: number;
}

interface ConferenceData {
  transactions: FinancialTransaction[];
  allocations: SharedCostAllocation[];
}

const EMPTY_TRANSACTIONS: FinancialTransaction[] = [];
const EMPTY_ALLOCATIONS: SharedCostAllocation[] = [];

export default function ConferencePage() {
  const lookups = useLookups();
  const [year, setYear] = useState(currentCompetence().slice(0, 4));
  const [project, setProject] = useState("all");
  const [response, setResponse] = useState<{ data?: ConferenceData; error?: string } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<FinancialTransaction[]>("/api/crud/transactions?limit=2000"),
      apiFetch<SharedCostAllocation[]>("/api/crud/allocations?limit=4000"),
    ])
      .then(([transactions, allocations]) => {
        if (active) setResponse({ data: { transactions: transactions.filter((item) => !item.archived), allocations } });
      })
      .catch((error: unknown) => {
        if (active) setResponse({ error: error instanceof Error ? error.message : "Não foi possível carregar a conferência." });
      });
    return () => { active = false; };
  }, []);

  const rows = response?.data?.transactions ?? EMPTY_TRANSACTIONS;
  const allocations = response?.data?.allocations ?? EMPTY_ALLOCATIONS;
  const projectMap = useMemo(() => new Map(lookups.projects.map((item) => [item.id, item.name])), [lookups.projects]);
  const categoryMap = useMemo(() => new Map(lookups.categories.map((item) => [item.id, item.name])), [lookups.categories]);
  const yearRows = useMemo(() => rows.filter((row) => row.competence_month?.startsWith(year)), [rows, year]);
  const visibleRows = useMemo(() => yearRows.filter((row) => {
    if (project === "all") return true;
    return project === "holding" ? !row.project_id : row.project_id === project;
  }), [project, yearRows]);
  const monthSummaries = useMemo(
    () => buildMonthSummaries(year, project, yearRows, allocations),
    [allocations, project, year, yearRows],
  );
  const totals = useMemo(() => monthSummaries.reduce((total, month) => ({
    gross: total.gross + month.gross,
    fees: total.fees + month.fees,
    net: total.net + month.net,
    costs: total.costs + month.costs,
    profit: total.profit + month.profit,
  }), { gross: 0, fees: 0, net: 0, costs: 0, profit: 0 }), [monthSummaries]);

  return (
    <>
      <PageHeader
        title="Conferência"
        description="Visão deliberadamente próxima da planilha para conferir o sistema durante a transição."
        actions={(
          <a className="button button-secondary" href={`/api/export/finance?format=xlsx&year=${year}${project === "holding" ? "&holding=1" : project !== "all" ? `&project_id=${project}` : ""}`}>
            <Download size={15} /> Exportar XLSX
          </a>
        )}
      />

      <div className="filter-bar">
        <div className="field"><label>Ano</label><input className="input" type="number" value={year} onChange={(event) => setYear(event.target.value)} /></div>
        <div className="field">
          <label>Projeto</label>
          <select className="select" value={project} onChange={(event) => setProject(event.target.value)}>
            <option value="all">Consolidado</option>
            <option value="holding">Prodexy / Holding</option>
            {lookups.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>

      {project !== "all" && project !== "holding" && (
        <div className="note" style={{ marginBottom: 14 }}>Na visão de projeto, o resumo mensal inclui custos compartilhados rateados. A tabela detalhada mostra os lançamentos financeiros originais; rateios não são duplicados como novas transações.</div>
      )}

      {response?.error ? (
        <div className="error-box">{response.error}</div>
      ) : !response?.data ? (
        <LoadingBlock lines={8} />
      ) : (
        <>
          <section className="panel table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Mês</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th className="numeric">Qtd.</th><th className="numeric">Valor unitário</th><th className="numeric">Valor bruto</th><th className="numeric">Taxa</th><th className="numeric">Valor líquido</th></tr></thead>
              <tbody>{visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.transaction_date)}</td>
                  <td>{row.competence_month?.slice(0, 7)}</td>
                  <td><Badge tone={row.transaction_type === "revenue" ? "positive" : "negative"}>{row.transaction_type === "revenue" ? "Receita" : "Custo"}</Badge></td>
                  <td>{categoryMap.get(row.category_id) || "—"}</td>
                  <td><strong>{row.description}</strong>{project === "all" && <div className="muted">{row.project_id ? projectMap.get(row.project_id) : "Prodexy / Holding"}</div>}</td>
                  <td className="numeric">{Number(row.quantity)}</td>
                  <td className="numeric">{formatMoney(row.unit_amount_cents)}</td>
                  <td className="numeric">{formatMoney(row.gross_amount_cents)}</td>
                  <td className="numeric">{formatMoney(row.fee_amount_cents)}</td>
                  <td className={`numeric ${row.net_amount_cents < 0 ? "negative" : ""}`}>{formatMoney(row.net_amount_cents)}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>

          <div className="section-title"><h2>Resumo mensal</h2><p>Janeiro a dezembro + total anual</p></div>
          <section className="panel table-wrap">
            <table>
              <thead><tr><th>Mês</th><th className="numeric">Receita bruta</th><th className="numeric">Taxas</th><th className="numeric">Receita líquida</th><th className="numeric">Custos</th><th className="numeric">Lucro</th><th className="numeric">Margem</th></tr></thead>
              <tbody>
                {monthSummaries.map((month) => (
                  <tr key={month.month}><td>{month.month}</td><td className="numeric">{formatMoney(month.gross)}</td><td className="numeric">{formatMoney(month.fees)}</td><td className="numeric">{formatMoney(month.net)}</td><td className="numeric">{formatMoney(month.costs)}</td><td className={`numeric ${month.profit < 0 ? "negative" : ""}`}>{formatMoney(month.profit)}</td><td className="numeric">{month.margin == null ? "—" : formatPercent(month.margin)}</td></tr>
                ))}
                <tr><td><strong>Total anual</strong></td><td className="numeric"><strong>{formatMoney(totals.gross)}</strong></td><td className="numeric"><strong>{formatMoney(totals.fees)}</strong></td><td className="numeric"><strong>{formatMoney(totals.net)}</strong></td><td className="numeric"><strong>{formatMoney(totals.costs)}</strong></td><td className={`numeric ${totals.profit < 0 ? "negative" : ""}`}><strong>{formatMoney(totals.profit)}</strong></td><td className="numeric">{totals.gross ? formatPercent(totals.profit / totals.gross * 100) : "—"}</td></tr>
              </tbody>
            </table>
          </section>

          <FinancialYearChart data={monthSummaries} />
        </>
      )}
    </>
  );
}

function buildMonthSummaries(
  year: string,
  project: string,
  yearRows: FinancialTransaction[],
  allocations: SharedCostAllocation[],
): MonthlyFinancialSummary[] {
  return Array.from({ length: 12 }, (_, index) => {
    const competence = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthRows = yearRows.filter((row) => row.competence_month?.startsWith(competence));
    const relevantRows = project === "all"
      ? monthRows
      : project === "holding"
        ? monthRows.filter((row) => !row.project_id)
        : monthRows.filter((row) => row.project_id === project);
    let gross = 0;
    let fees = 0;
    let costs = 0;

    for (const row of relevantRows) {
      if (isRevenueRecognized(row, "competence")) {
        gross += Number(row.gross_amount_cents);
        fees += Number(row.fee_amount_cents);
      } else if (row.transaction_type === "cost" && row.status === "paid") {
        if (project !== "all" && project !== "holding" && row.cost_scope !== "direct") continue;
        costs += Number(row.gross_amount_cents) + Number(row.fee_amount_cents);
      }
    }

    if (project !== "all" && project !== "holding") {
      const sharedTransactionIds = new Set(monthRows
        .filter((row) => row.transaction_type === "cost" && row.cost_scope === "shared" && row.status === "paid")
        .map((row) => row.id));
      costs += allocations
        .filter((allocation) => allocation.project_id === project && sharedTransactionIds.has(allocation.transaction_id))
        .reduce((total, allocation) => total + Number(allocation.allocated_amount_cents), 0);
    }

    const net = gross - fees;
    const profit = net - costs;
    return {
      month: MONTHS_PT[index],
      gross,
      fees,
      net,
      costs,
      profit,
      margin: gross ? profit / gross * 100 : null,
    };
  });
}
