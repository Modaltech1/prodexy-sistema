"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  HandCoins,
  Landmark,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { LoadingBlock } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/client-api";
import { currentCompetence } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/money";
import type { FinancialDashboardData, ProjectFinancialSummary } from "@/lib/types";

type FinancialBasis = "competence" | "cash";

export default function FinancePage() {
  const [month, setMonth] = useState(currentCompetence().slice(0, 7));
  const [basis, setBasis] = useState<FinancialBasis>("competence");
  const requestKey = `${month}:${basis}`;
  const [response, setResponse] = useState<{ key: string; data?: FinancialDashboardData; error?: string } | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<FinancialDashboardData>(`/api/dashboard?month=${month}&basis=${basis}`)
      .then((result) => {
        if (active) setResponse({ key: requestKey, data: result });
      })
      .catch((error: unknown) => {
        if (active) setResponse({ key: requestKey, error: error instanceof Error ? error.message : "Não foi possível carregar o financeiro." });
      });
    return () => { active = false; };
  }, [basis, month, requestKey]);

  const currentResponse = response?.key === requestKey ? response : null;
  const data = currentResponse?.data ?? null;

  const maxRevenue = useMemo(
    () => Math.max(1, ...(data?.project_summaries ?? []).map((project) => project.revenue_net_cents)),
    [data],
  );
  const consolidatedProfit = data ? data.revenue_net_cents - data.total_costs_cents : 0;

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Visão consolidada da holding, sem confundir faturamento dos projetos com o resultado que efetivamente pertence à Prodexy."
      />

      <div className="finance-context-bar" aria-label="Período da visão financeira">
        <div className="field">
          <label>Base</label>
          <select className="select" value={basis} onChange={(event) => setBasis(event.target.value as FinancialBasis)}>
            <option value="competence">Competência</option>
            <option value="cash">Caixa realizado</option>
          </select>
        </div>
        <div className="field">
          <label>Mês</label>
          <input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <p className="finance-context-copy">
          {basis === "cash"
            ? "Entradas e saídas efetivamente realizadas no período."
            : "Resultado econômico usado no fechamento societário."}
        </p>
      </div>

      {currentResponse?.error ? (
        <div className="error-box">{currentResponse.error}</div>
      ) : !data ? (
        <LoadingBlock lines={8} />
      ) : (
        <>
          {data.shared_holding_remainder_cents > 0 && (
            <div className="note finance-notice">
              <strong>{formatMoney(data.shared_holding_remainder_cents)}</strong> dos custos compartilhados ficou na holding por não ter sido rateado entre projetos.
            </div>
          )}
          {data.shared_allocation_difference_cents < 0 && (
            <div className="warning-box finance-notice">
              <AlertTriangle size={15} /> O rateio de custos compartilhados ultrapassou o valor original. Revise as alocações.
            </div>
          )}
          {data.project_summaries.some((project) => project.participation_valid === false) && (
            <div className="warning-box finance-notice">
              <AlertTriangle size={15} /> Existem projetos cuja soma das participações societárias não é 100%. Os valores de distribuição são provisórios e o fechamento será bloqueado até a correção.
            </div>
          )}

          <div className="kpi-grid finance-kpi-grid">
            <KpiCard label="Receita bruta" value={formatMoney(data.revenue_gross_cents)} detail={basis === "cash" ? "Recebimentos realizados no mês" : "Receitas realizadas da competência"} icon={<Banknote size={17} />} />
            <KpiCard label="Receita líquida" value={formatMoney(data.revenue_net_cents)} detail={`${formatMoney(data.revenue_fees_cents)} em taxas financeiras`} icon={<ReceiptText size={17} />} />
            <KpiCard label="Custos pagos" value={formatMoney(data.total_costs_cents)} detail={basis === "cash" ? "Pagamentos realizados no mês" : "Custos pagos, sem duplicar rateios"} tone="negative" icon={<WalletCards size={17} />} />
            <KpiCard label="Lucro líquido" value={formatMoney(consolidatedProfit)} detail="Receita líquida menos todos os custos" tone={consolidatedProfit >= 0 ? "positive" : "negative"} icon={<TrendingUp size={17} />} />
            <KpiCard label="Resultado Prodexy" value={formatMoney(data.prodexy_result_cents)} detail="Após participação de sócios e resultado da holding" tone={data.prodexy_result_cents >= 0 ? "positive" : "negative"} icon={<Landmark size={17} />} />
          </div>

          {basis === "cash" && (
            <div className="note finance-notice">
              <strong>Base caixa:</strong> os números usam a data efetiva de recebimento ou pagamento. Distribuições exibidas nessa visão são gerenciais; o fechamento societário oficial continua sendo feito por competência.
            </div>
          )}

          <div className="grid-2">
            <section className="panel">
              <div className="panel-header"><h2>Composição do resultado</h2></div>
              <div className="panel-body money-breakdown">
                <div className="money-line"><span>Receita líquida consolidada</span><strong>{formatMoney(data.revenue_net_cents)}</strong></div>
                <div className="money-line"><span>Custos pagos consolidados</span><strong className="negative">-{formatMoney(data.total_costs_cents)}</strong></div>
                <div className="money-line subtotal"><span>Lucro líquido consolidado</span><strong className={consolidatedProfit < 0 ? "negative" : "positive"}>{formatMoney(consolidatedProfit)}</strong></div>
                <div className="money-line"><span>Lucro líquido dos projetos</span><strong>{formatMoney(data.project_profit_cents)}</strong></div>
                <div className="money-line"><span>Lucro destinado a sócios externos</span><strong>{formatMoney(data.external_share_cents)}</strong></div>
                <div className="money-line"><span>Custos exclusivos da holding</span><strong>{formatMoney(data.holding_costs_cents)}</strong></div>
                <div className="money-line total"><span>Resultado pertencente à Prodexy</span><strong className={data.prodexy_result_cents < 0 ? "negative" : "positive"}>{formatMoney(data.prodexy_result_cents)}</strong></div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Receita líquida por projeto</h2></div>
              <div className="panel-body bar-list">
                {data.project_summaries.map((project) => (
                  <div className="bar-row" key={project.project_id}>
                    <Link href={`/projetos/${project.project_id}`} className="table-link">{project.project_name}</Link>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(1, project.revenue_net_cents / maxRevenue * 100)}%` }} /></div>
                    <strong className="number">{formatMoney(project.revenue_net_cents)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="section-title"><h2>Projetos</h2><Link href="/financeiro/projetos" className="muted">Comparação completa</Link></div>
          <section className="panel table-wrap">
            <table>
              <thead><tr><th>Projeto</th><th>Tipo</th><th className="numeric">Receita líquida</th><th className="numeric">Custos</th><th className="numeric">Lucro</th><th className="numeric">Margem</th><th className="numeric">Sócios externos</th><th className="numeric">Parte Prodexy</th></tr></thead>
              <tbody>{data.project_summaries.map((project) => <ProjectRow key={project.project_id} project={project} />)}</tbody>
            </table>
          </section>

          <div className="section-title"><h2>Distribuições</h2></div>
          <div className="grid-2">
            <KpiCard label="Pendente para sócios externos" value={formatMoney(data.pending_distributions_cents)} detail="Valores de fechamentos já apurados" tone={data.pending_distributions_cents > 0 ? "warning" : "neutral"} icon={<HandCoins size={17} />} />
            <div className="panel"><div className="panel-body"><div className="note"><strong>Regra do sistema:</strong> receita → taxas → custos → lucro do projeto → distribuição do lucro. Repasses não entram como custo operacional.</div></div></div>
          </div>
        </>
      )}
    </>
  );
}

function ProjectRow({ project }: { project: ProjectFinancialSummary }) {
  const projectType = project.project_type === "saas" ? "SaaS" : project.project_type === "client" ? "Cliente" : "Interno";
  return (
    <tr>
      <td><Link href={`/projetos/${project.project_id}`} className="table-link">{project.project_name}</Link></td>
      <td><Badge>{projectType}</Badge></td>
      <td className="numeric">{formatMoney(project.revenue_net_cents)}</td>
      <td className="numeric">{formatMoney(project.direct_costs_cents + project.shared_costs_cents)}</td>
      <td className={`numeric ${project.profit_cents < 0 ? "negative" : ""}`}>{formatMoney(project.profit_cents)}</td>
      <td className="numeric">{project.margin_percentage == null ? "—" : formatPercent(project.margin_percentage)}</td>
      <td className="numeric">{formatMoney(project.external_share_cents)}</td>
      <td className="numeric"><strong>{formatMoney(project.prodexy_share_cents)}</strong></td>
    </tr>
  );
}
