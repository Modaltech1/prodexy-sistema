"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Play, Square, WalletCards, Target, BriefcaseBusiness, CalendarClock, ListChecks, ArrowUp, ArrowDown, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/loading";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { currentCompetence, formatDateTime } from "@/lib/date";
import type { Lead, Task } from "@/lib/types";

function taskTone(priority: string) {
  return priority === "critical" ? "negative" : priority === "high" ? "warning" : "neutral";
}
function priorityLabel(v: string) { return ({ critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" } as any)[v] || v; }

export default function TodayPage() {
  const month = currentCompetence().slice(0, 7);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [activeTimer, setActiveTimer] = useState<any>(null);
  const [hours, setHours] = useState(6);
  const [plan, setPlan] = useState<any>(null);
  const [planning, setPlanning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, t, l, g, timer] = await Promise.all([
        apiFetch<any>(`/api/dashboard?month=${month}&basis=cash`),
        apiFetch<Task[]>("/api/crud/tasks?limit=300"),
        apiFetch<Lead[]>("/api/crud/leads?limit=200"),
        apiFetch<any>(`/api/goals-summary?month=${month}`),
        apiFetch<any>("/api/timer"),
      ]);
      setDashboard(d); setTasks(t); setLeads(l); setGoals(g.rows || []); setActiveTimer(timer);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openTasks = useMemo(() => tasks.filter((t) => !t.archived && !["done","cancelled"].includes(t.status)), [tasks]);
  const overdue = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now());
  const critical = openTasks.filter((t) => t.priority === "critical");
  const waiting = openTasks.filter((t) => t.status === "waiting");
  const dueLeads = leads.filter((l) => l.stage !== "won" && l.stage !== "lost" && l.next_action_at && new Date(l.next_action_at).getTime() <= Date.now() + 86400000);
  const hotLeads = leads.filter((l) => l.temperature === "hot" && !["won","lost"].includes(l.stage));

  const totalGoal = goals.reduce((s, g) => s + Number(g.target_total_revenue_cents || 0), 0);
  const totalActual = goals.reduce((s, g) => s + Number(g.actual_total_revenue_cents || 0), 0);
  const goalPct = totalGoal ? Math.min(100, Math.round(totalActual / totalGoal * 100)) : 0;

  const makePlan = async () => {
    setPlanning(true);
    try { setPlan(await apiFetch<any>(`/api/work-plan?minutes=${Math.round(hours * 60)}`)); } finally { setPlanning(false); }
  };
  const startTimer = async (taskId: string) => { await apiFetch("/api/timer", { method: "POST", body: JSON.stringify({ action: "start", task_id: taskId }) }); await load(); };
  const stopTimer = async () => { await apiFetch("/api/timer", { method: "POST", body: JSON.stringify({ action: "stop" }) }); await load(); };

  const movePlanItem = (index: number, delta: number) => {
    setPlan((current: any) => {
      if (!current) return current;
      const items = [...current.items];
      const target = index + delta;
      if (target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });
  };
  const removePlanItem = (index: number) => {
    setPlan((current: any) => {
      if (!current) return current;
      const items = current.items.filter((_: any, i: number) => i !== index);
      const planned = items.reduce((sum: number, item: any) => sum + Number(item.planned_minutes || 0), 0);
      return { ...current, items, planned_minutes: planned, remaining_minutes: Math.max(0, current.available_minutes - planned) };
    });
  };

  const savePlan = async () => {
    if (!plan?.items?.length) return;
    await apiFetch("/api/work-plan", { method: "POST", body: JSON.stringify({ available_minutes: plan.available_minutes, items: plan.items.map((x: any) => ({ task_id: x.id, planned_minutes: x.planned_minutes, score: x.score, reason: x.reason })) }) });
  };

  if (loading) return <><PageHeader title="Hoje" description="Prioridades, execução e situação atual da Prodexy Labs."/><LoadingBlock lines={8}/></>;

  return <>
    <PageHeader title="Hoje" description="O ponto de partida para decidir onde colocar seu tempo agora." actions={activeTimer ? <Button variant="danger" onClick={stopTimer}><Square size={15}/> Parar cronômetro</Button> : undefined}/>

    {activeTimer && <div className="success-box" style={{ marginBottom: 16 }}><strong>Cronômetro ativo.</strong> Iniciado em {formatDateTime(activeTimer.started_at)}. O sistema impede dois cronômetros simultâneos.</div>}

    <div className="kpi-grid">
      <KpiCard label="Resultado Prodexy no mês" value={formatMoney(dashboard?.prodexy_result_cents)} detail="Holding + sua parcela nos projetos" tone={(dashboard?.prodexy_result_cents || 0) >= 0 ? "positive" : "negative"} icon={<WalletCards size={17}/>}/>
      <KpiCard label="Demandas abertas" value={String(openTasks.length)} detail={`${overdue.length} atrasadas · ${critical.length} críticas`} tone={critical.length || overdue.length ? "warning" : "neutral"} icon={<ListChecks size={17}/>}/>
      <KpiCard label="Meta de receita" value={`${goalPct}%`} detail={`${formatMoney(totalActual)} de ${formatMoney(totalGoal)}`} icon={<Target size={17}/>}/>
      <KpiCard label="Leads quentes" value={String(hotLeads.length)} detail={`${dueLeads.length} follow-ups vencendo/atrasados`} icon={<BriefcaseBusiness size={17}/>}/>
    </div>

    <div className="grid-2">
      <section className="panel">
        <div className="panel-header"><h2>Planejar sessão de trabalho</h2><CalendarClock size={17} className="muted"/></div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 9, alignItems: "end", marginBottom: 14 }}>
            <div className="field" style={{ width: 150 }}><label>Tempo disponível</label><select className="select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,10,12].map((h) => <option key={h} value={h}>{h}h</option>)}</select></div>
            <Button onClick={makePlan} disabled={planning}>{planning ? "Planejando..." : `Planejar próximas ${hours}h`}</Button>
          </div>
          {!plan ? <div className="note">O plano usa prioridade, atraso, prazo, cliente relacionado e trabalho já em andamento. A lógica é determinística; você continua decidindo a ordem final.</div> : <>
            <div className="timeline">
              {plan.items.map((item: any, index: number) => <div className="timeline-item" key={item.id}>
                <div className="timeline-time">{item.planned_minutes} min</div>
                <div className="timeline-main"><strong>{item.title}</strong><span>{item.project_name || "Prodexy Labs"} · {item.reason}</span></div>
                <div className="inline-actions"><button className="icon-button" title="Subir" disabled={index===0} onClick={()=>movePlanItem(index,-1)}><ArrowUp size={14}/></button><button className="icon-button" title="Descer" disabled={index===plan.items.length-1} onClick={()=>movePlanItem(index,1)}><ArrowDown size={14}/></button><button className="icon-button" title="Remover do plano" onClick={()=>removePlanItem(index)}><X size={14}/></button><Button variant="secondary" onClick={() => startTimer(item.id)}><Play size={14}/> Iniciar</Button></div>
              </div>)}
            </div>
            {plan.items.length === 0 && <EmptyState title="Nenhuma demanda elegível" description="Cadastre demandas ou mova itens concluídos de volta para um status aberto."/>}
            {plan.items.length > 0 && <div className="form-actions"><span className="muted" style={{ marginRight: "auto" }}>{plan.planned_minutes} min planejados · {plan.remaining_minutes} min livres</span><Button variant="secondary" onClick={savePlan}>Salvar sessão</Button></div>}
          </>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Precisa de atenção</h2><AlertTriangle size={17} className="muted"/></div>
        <div className="panel-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {[...critical.slice(0,3), ...overdue.filter((x) => !critical.some((c) => c.id === x.id)).slice(0,3)].slice(0,5).map((task) => <div className="alert-row" key={task.id}><Badge tone={taskTone(task.priority) as any}>{priorityLabel(task.priority)}</Badge><div><Link className="table-link" href={`/demandas?tarefa=${task.id}`}>{task.title}</Link><small>{task.due_at ? `Prazo: ${formatDateTime(task.due_at)}` : "Sem prazo"}</small></div></div>)}
          {waiting.slice(0,2).map((task) => <div className="alert-row" key={`wait-${task.id}`}><Badge tone="info">Aguardando</Badge><div><Link className="table-link" href={`/demandas?tarefa=${task.id}`}>{task.title}</Link><small>Demanda aguardando resposta ou dependência</small></div></div>)}
          {dueLeads.slice(0,3).map((lead) => <div className="alert-row" key={`lead-${lead.id}`}><Badge tone="purple">Comercial</Badge><div><Link className="table-link" href={`/comercial?lead=${lead.id}`}>{lead.company || lead.name}</Link><small>{lead.next_action || "Follow-up comercial"}</small></div></div>)}
          {critical.length + overdue.length + waiting.length + dueLeads.length === 0 && <EmptyState title="Nenhum alerta imediato" description="Não há demandas críticas/atrasadas, esperas ou follow-ups vencidos agora."/>}
        </div>
      </section>
    </div>

    <div className="section-title"><h2>Projetos neste mês</h2><Link href="/projetos" className="muted">Ver todos</Link></div>
    <section className="panel table-wrap">
      <table><thead><tr><th>Projeto</th><th className="numeric">Receita líquida</th><th className="numeric">Custos</th><th className="numeric">Lucro</th><th className="numeric">Parte Prodexy</th></tr></thead><tbody>
        {(dashboard?.project_summaries || []).map((p: any) => <tr key={p.project_id}><td><Link className="table-link" href={`/projetos/${p.project_id}`}>{p.project_name}</Link></td><td className="numeric">{formatMoney(p.revenue_net_cents)}</td><td className="numeric">{formatMoney(p.direct_costs_cents + p.shared_costs_cents)}</td><td className={`numeric ${p.profit_cents < 0 ? "negative" : ""}`}>{formatMoney(p.profit_cents)}</td><td className="numeric"><strong>{formatMoney(p.prodexy_share_cents)}</strong></td></tr>)}
      </tbody></table>
    </section>
  </>;
}
