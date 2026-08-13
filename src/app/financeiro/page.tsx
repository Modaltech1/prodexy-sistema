"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, HandCoins, ReceiptText, TrendingUp, WalletCards, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock } from "@/components/ui/loading";
import { apiFetch } from "@/lib/client-api";
import { formatMoney, formatPercent } from "@/lib/money";
import { currentCompetence } from "@/lib/date";

export default function FinancePage() {
  const [month, setMonth] = useState(currentCompetence().slice(0,7));
  const [basis, setBasis] = useState<"competence"|"cash">("competence");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); apiFetch<any>(`/api/dashboard?month=${month}&basis=${basis}`).then(setData).finally(() => setLoading(false)); }, [month, basis]);
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.project_summaries || []).map((x:any) => x.revenue_net_cents)), [data]);
  return <>
    <PageHeader title="Financeiro" description="Visão consolidada da holding, sem confundir faturamento dos projetos com o resultado que efetivamente pertence à Prodexy." actions={<div className="inline-actions"><div className="field"><label>Base</label><select className="select" value={basis} onChange={(e)=>setBasis(e.target.value as any)}><option value="competence">Competência</option><option value="cash">Caixa realizado</option></select></div><div className="field"><label>Mês</label><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)}/></div></div>}/>
    {loading ? <LoadingBlock lines={8}/> : <>
      {data?.shared_allocation_difference_cents !== 0 && <div className="warning-box" style={{ marginBottom: 14 }}><AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }}/> Existe diferença de {formatMoney(data.shared_allocation_difference_cents)} entre custos compartilhados pagos e valores rateados neste mês. Revise os rateios.</div>}
      {(data?.project_summaries || []).some((p:any) => p.participation_valid === false) && <div className="warning-box" style={{ marginBottom: 14 }}><AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }}/> Existem projetos cuja soma das participações societárias não é 100%. Os valores de distribuição exibidos são provisórios e o fechamento será bloqueado até a correção.</div>}
      <div className="kpi-grid">
        <KpiCard label="Receita bruta" value={formatMoney(data?.revenue_gross_cents)} detail={basis === "cash" ? "Recebimentos realizados no mês" : "Receitas realizadas da competência"} icon={<Banknote size={17}/>}/>
        <KpiCard label="Receita líquida" value={formatMoney(data?.revenue_net_cents)} detail={`${formatMoney(data?.revenue_fees_cents)} em taxas financeiras`} icon={<ReceiptText size={17}/>}/>
        <KpiCard label="Custos pagos" value={formatMoney(data?.total_costs_cents)} detail={basis === "cash" ? "Pagamentos realizados no mês" : "Custos pagos da competência, sem duplicar rateios"} tone="negative" icon={<WalletCards size={17}/>}/>
        <KpiCard label="Resultado Prodexy" value={formatMoney(data?.prodexy_result_cents)} detail="Holding + participação nos lucros" tone={(data?.prodexy_result_cents || 0) >= 0 ? "positive" : "negative"} icon={<TrendingUp size={17}/>}/>
      </div>
      {basis === "cash" && <div className="note" style={{marginBottom:14}}><strong>Base caixa:</strong> os números usam a data efetiva de recebimento/pagamento. Distribuições exibidas nessa visão são gerenciais; o fechamento societário oficial continua sendo feito por competência.</div>}
      <div className="grid-2">
        <section className="panel"><div className="panel-header"><h2>Composição do resultado</h2></div><div className="panel-body money-breakdown">
          <div className="money-line"><span>Receita líquida consolidada</span><strong>{formatMoney(data.revenue_net_cents)}</strong></div>
          <div className="money-line"><span>Custos pagos consolidados</span><strong className="negative">-{formatMoney(data.total_costs_cents)}</strong></div>
          <div className="money-line"><span>Lucro gerencial dos projetos</span><strong>{formatMoney(data.project_profit_cents)}</strong></div>
          <div className="money-line"><span>Lucro destinado a sócios externos</span><strong>{formatMoney(data.external_share_cents)}</strong></div>
          <div className="money-line"><span>Custos exclusivos da holding</span><strong>{formatMoney(data.holding_costs_cents)}</strong></div>
          <div className="money-line total"><span>Resultado pertencente à Prodexy</span><strong className={data.prodexy_result_cents < 0 ? "negative" : "positive"}>{formatMoney(data.prodexy_result_cents)}</strong></div>
        </div></section>
        <section className="panel"><div className="panel-header"><h2>Receita líquida por projeto</h2></div><div className="panel-body bar-list">
          {(data.project_summaries || []).map((p:any) => <div className="bar-row" key={p.project_id}><Link href={`/projetos/${p.project_id}`} className="table-link">{p.project_name}</Link><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(1, p.revenue_net_cents / maxRevenue * 100)}%` }}/></div><strong className="number">{formatMoney(p.revenue_net_cents)}</strong></div>)}
        </div></section>
      </div>
      <div className="section-title"><h2>Projetos</h2><Link href="/financeiro/projetos" className="muted">Comparação completa</Link></div>
      <section className="panel table-wrap"><table><thead><tr><th>Projeto</th><th>Tipo</th><th className="numeric">Receita líquida</th><th className="numeric">Custos</th><th className="numeric">Lucro</th><th className="numeric">Margem</th><th className="numeric">Sócios externos</th><th className="numeric">Parte Prodexy</th></tr></thead><tbody>
        {(data.project_summaries || []).map((p:any) => <tr key={p.project_id}><td><Link href={`/projetos/${p.project_id}`} className="table-link">{p.project_name}</Link></td><td><Badge>{p.project_type === "saas" ? "SaaS" : p.project_type === "client" ? "Cliente" : "Interno"}</Badge></td><td className="numeric">{formatMoney(p.revenue_net_cents)}</td><td className="numeric">{formatMoney(p.direct_costs_cents+p.shared_costs_cents)}</td><td className={`numeric ${p.profit_cents < 0 ? "negative" : ""}`}>{formatMoney(p.profit_cents)}</td><td className="numeric">{p.margin_percentage == null ? "—" : formatPercent(p.margin_percentage)}</td><td className="numeric">{formatMoney(p.external_share_cents)}</td><td className="numeric"><strong>{formatMoney(p.prodexy_share_cents)}</strong></td></tr>)}
      </tbody></table></section>
      <div className="section-title"><h2>Distribuições</h2></div>
      <div className="grid-2"><KpiCard label="Pendente para sócios externos" value={formatMoney(data.pending_distributions_cents)} detail="Valores de fechamentos já apurados" tone={data.pending_distributions_cents > 0 ? "warning" : "neutral"} icon={<HandCoins size={17}/>}/><div className="panel"><div className="panel-body"><div className="note"><strong>Regra do sistema:</strong> receita → taxas → custos → lucro do projeto → distribuição do lucro. Repasses não entram como custo operacional.</div></div></div></div>
    </>}
  </>;
}
