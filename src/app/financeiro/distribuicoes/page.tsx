"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock } from "@/components/ui/loading";
import { EmptyState } from "@/components/ui/empty-state";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { apiFetch, crudUpdate } from "@/lib/client-api";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, todayInSaoPaulo } from "@/lib/date";

export default function DistributionsPage(){
 const [rows,setRows]=useState<any[]>([]),[closings,setClosings]=useState<any[]>([]),[projects,setProjects]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [status,setStatus]=useState("all");
 const load=async()=>{setLoading(true);try{const[d,c,p]=await Promise.all([apiFetch<any[]>("/api/crud/distributions?limit=2000"),apiFetch<any[]>("/api/crud/closings?limit=1000"),apiFetch<any[]>("/api/crud/projects?limit=500")]);setRows(d);setClosings(c);setProjects(p);}finally{setLoading(false)}};useEffect(()=>{void load()},[]);
 const closingMap=useMemo(()=>new Map(closings.map(c=>[c.id,c])),[closings]),projectMap=useMemo(()=>new Map(projects.map(p=>[p.id,p.name])),[projects]);
 const filtered=rows.filter(r=>r.partner_type_snapshot==="external"&&closingMap.get(r.closing_id)?.status==="closed"&&(status==="all"||r.payment_status===status));
 const pending=filtered.filter(r=>r.payment_status==="pending").reduce((s,r)=>s+Number(r.amount_cents),0);
 const mark=async(r:any,newStatus:string)=>{await crudUpdate("distributions",r.id,{payment_status:newStatus,paid_at:newStatus==="paid"?todayInSaoPaulo():null});await load()};
 return <><PageHeader title="Distribuição de lucro" description="Repasses são gerados depois do fechamento e não são tratados como custo operacional."/>
 <div className="filter-bar"><div className="field"><label>Status</label><select className="select" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos</option><option value="pending">Pendente</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option></select></div><div style={{marginLeft:"auto"}}><strong>Pendente: {formatMoney(pending)}</strong></div></div>
 {loading?<LoadingBlock lines={6}/>:<section className="panel table-wrap">{filtered.length===0?<EmptyState title="Nenhuma distribuição" description="Feche um mês de um projeto com sócios externos para gerar os repasses."/>:<table><thead><tr><th>Competência</th><th>Projeto</th><th>Sócio</th><th className="numeric">Participação</th><th className="numeric">Valor</th><th>Status</th><th>Pagamento</th><th></th></tr></thead><tbody>{filtered.map(r=>{const c=closingMap.get(r.closing_id);return <tr key={r.id}><td>{c?.competence_month?.slice(0,7)||"—"}</td><td>{projectMap.get(c?.project_id)||"—"}</td><td><strong>{r.partner_name_snapshot}</strong></td><td className="numeric">{formatPercent(r.participation_percentage_snapshot,2)}</td><td className="numeric"><strong>{formatMoney(r.amount_cents)}</strong></td><td><Badge tone={r.payment_status==="paid"?"positive":r.payment_status==="pending"?"warning":"neutral"}>{r.payment_status==="paid"?"Pago":r.payment_status==="pending"?"Pendente":"Cancelado"}</Badge></td><td>{formatDate(r.paid_at)}</td><td><RowActionsMenu label={`Opções da distribuição de ${r.partner_name_snapshot}`} actions={[r.payment_status!=="paid"?{label:"Marcar como pago",icon:<Check size={15}/>,onSelect:()=>mark(r,"paid")}:{label:"Reabrir pagamento",icon:<RotateCcw size={15}/>,onSelect:()=>mark(r,"pending")}]}/></td></tr>})}</tbody></table>}</section>}</>;
}
