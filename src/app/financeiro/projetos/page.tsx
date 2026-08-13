"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingBlock } from "@/components/ui/loading";
import { apiFetch } from "@/lib/client-api";
import { formatMoney, formatPercent } from "@/lib/money";
import { currentCompetence } from "@/lib/date";

export default function FinancialProjectsPage() {
  const [month,setMonth]=useState(currentCompetence().slice(0,7)); const [data,setData]=useState<any>(null); const [loading,setLoading]=useState(true);
  useEffect(()=>{setLoading(true);apiFetch<any>(`/api/dashboard?month=${month}`).then(setData).finally(()=>setLoading(false));},[month]);
  return <><PageHeader title="Comparação financeira dos projetos" description="Compare rentabilidade, custos, margens e a parcela que efetivamente pertence à Prodexy." actions={<div className="field"><label>Competência</label><input className="input" type="month" value={month} onChange={(e)=>setMonth(e.target.value)}/></div>}/>{loading?<LoadingBlock lines={7}/>:<section className="panel table-wrap"><table><thead><tr><th>Projeto</th><th className="numeric">Bruto</th><th className="numeric">Taxas</th><th className="numeric">Líquido</th><th className="numeric">Custo direto</th><th className="numeric">Rateio</th><th className="numeric">Lucro</th><th className="numeric">Margem</th><th className="numeric">Parte Prodexy</th></tr></thead><tbody>{(data?.project_summaries||[]).map((p:any)=><tr key={p.project_id}><td><Link className="table-link" href={`/projetos/${p.project_id}`}>{p.project_name}</Link></td><td className="numeric">{formatMoney(p.revenue_gross_cents)}</td><td className="numeric">{formatMoney(p.revenue_fees_cents)}</td><td className="numeric">{formatMoney(p.revenue_net_cents)}</td><td className="numeric">{formatMoney(p.direct_costs_cents)}</td><td className="numeric">{formatMoney(p.shared_costs_cents)}</td><td className={`numeric ${p.profit_cents<0?"negative":""}`}>{formatMoney(p.profit_cents)}</td><td className="numeric">{p.margin_percentage==null?"—":formatPercent(p.margin_percentage)}</td><td className="numeric"><strong>{formatMoney(p.prodexy_share_cents)}</strong></td></tr>)}</tbody></table></section>}</>;
}
