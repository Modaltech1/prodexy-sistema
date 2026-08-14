"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, crudCreate, crudUpdate } from "@/lib/client-api";
import { currentCompetence } from "@/lib/date";
import { formatMoney, moneyToCents } from "@/lib/money";
import { useLookups } from "@/lib/use-lookups";

type GoalRow = {
  id: string;
  label: string;
  scope_type: "project" | "client_projects" | "holding";
  project_id?: string | null;
  target_clients: number;
  target_setup_revenue_cents: number;
  target_recurring_revenue_cents: number;
  target_total_revenue_cents: number;
  actual_clients: number;
  actual_setup_revenue_cents: number;
  actual_recurring_revenue_cents: number;
  actual_total_revenue_cents: number;
  notes?: string | null;
};

type GoalsSummary = { month: string; rows: GoalRow[] };
type GoalObjective = { actual: number; target: number };
type ProgressSummary = { percentage: number; completed: number; total: number };

function objectivesForGoal(goal: GoalRow): GoalObjective[] {
  const objectives: GoalObjective[] = [];
  const targetClients = Number(goal.target_clients);
  const targetSetup = Number(goal.target_setup_revenue_cents);
  const targetRecurring = Number(goal.target_recurring_revenue_cents);
  const targetTotal = Number(goal.target_total_revenue_cents);

  if (targetClients > 0) objectives.push({ actual: Number(goal.actual_clients), target: targetClients });
  if (targetSetup > 0) objectives.push({ actual: Number(goal.actual_setup_revenue_cents), target: targetSetup });
  if (targetRecurring > 0) objectives.push({ actual: Number(goal.actual_recurring_revenue_cents), target: targetRecurring });

  // Total is a fallback for legacy goals that do not split revenue by bucket.
  if (targetSetup === 0 && targetRecurring === 0 && targetTotal > 0) {
    objectives.push({ actual: Number(goal.actual_total_revenue_cents), target: targetTotal });
  }

  return objectives;
}

function summarizeObjectives(objectives: GoalObjective[]): ProgressSummary {
  if (objectives.length === 0) return { percentage: 0, completed: 0, total: 0 };

  const progress = objectives.reduce((sum, objective) => {
    return sum + Math.min(1, Math.max(0, objective.actual / objective.target));
  }, 0);

  return {
    percentage: Math.round((progress / objectives.length) * 100),
    completed: objectives.filter((objective) => objective.actual >= objective.target).length,
    total: objectives.length,
  };
}

function calculateMonthlyProgress(rows: GoalRow[]) {
  return summarizeObjectives(rows.flatMap(objectivesForGoal));
}

function GradientProgress({ progress, label, large = false }: { progress: ProgressSummary; label: string; large?: boolean }) {
  const style = { "--progress": `${progress.percentage}%` } as CSSProperties;
  return <div
    className={`progress heat-progress${large ? " goals-progress" : ""}`}
    style={style}
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={progress.percentage}
  />;
}

export default function GoalsPage() {
  const lookups = useLookups();
  const [month, setMonth] = useState(currentCompetence().slice(0, 7));
  const [data, setData] = useState<GoalsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<GoalRow | null>(null);
  const [scope, setScope] = useState<GoalRow["scope_type"]>("project");
  const [projectId, setProjectId] = useState("");
  const [clients, setClients] = useState("0");
  const [setup, setSetup] = useState("0");
  const [recurring, setRecurring] = useState("0");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<GoalsSummary>(`/api/goals-summary?month=${month}`));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const monthlyProgress = useMemo(() => calculateMonthlyProgress(rows), [rows]);

  function openNew() {
    setEditing(null);
    setScope("project");
    setProjectId(lookups.projects[0]?.id || "");
    setClients("0");
    setSetup("0");
    setRecurring("0");
    setTotal("");
    setNotes("");
    setError("");
    setModal(true);
  }

  function openEdit(goal: GoalRow) {
    setEditing(goal);
    setScope(goal.scope_type);
    setProjectId(goal.project_id || "");
    setClients(String(goal.target_clients));
    setSetup((Number(goal.target_setup_revenue_cents) / 100).toFixed(2).replace(".", ","));
    setRecurring((Number(goal.target_recurring_revenue_cents) / 100).toFixed(2).replace(".", ","));
    setTotal((Number(goal.target_total_revenue_cents) / 100).toFixed(2).replace(".", ","));
    setNotes(goal.notes || "");
    setError("");
    setModal(true);
  }

  const save = async () => {
    if (scope === "project" && !projectId) {
      setError("Selecione um projeto.");
      return;
    }

    setSaving(true);
    setError("");
    const setupCents = moneyToCents(setup);
    const recurringCents = moneyToCents(recurring);
    const totalCents = total.trim() ? moneyToCents(total) : setupCents + recurringCents;
    const payload = {
      scope_type: scope,
      project_id: scope === "project" ? projectId : null,
      competence_month: `${month}-01`,
      target_clients: Number(clients) || 0,
      target_setup_revenue_cents: setupCents,
      target_recurring_revenue_cents: recurringCents,
      target_total_revenue_cents: totalCents,
      notes: notes || null,
    };

    try {
      if (editing) await crudUpdate("goals", editing.id, payload);
      else await crudCreate("goals", payload);
      setModal(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Verifique se já existe meta para esse escopo/mês.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <PageHeader
      title="Metas"
      description="Planejado × realizado por projeto, SaaS e projetos de cliente da Prodexy."
      actions={<Button onClick={openNew}><Plus size={15} /> Nova meta</Button>}
    />

    <div className="filter-bar">
      <div className="field">
        <label>Competência</label>
        <input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </div>
    </div>

    {loading ? <LoadingBlock lines={7} /> : rows.length === 0 ? (
      <section className="panel">
        <EmptyState title="Nenhuma meta nesta competência" description="Defina metas de clientes e receita para acompanhar o realizado." />
      </section>
    ) : <>
      <section className="panel goals-summary" aria-label="Progresso geral do mês">
        <div className="goals-summary-header">
          <div>
            <span className="muted">Progresso geral do mês</span>
            <strong>{monthlyProgress.percentage}%</strong>
          </div>
          <Badge tone={monthlyProgress.percentage === 100 ? "positive" : "neutral"}>
            {monthlyProgress.total > 0 ? `${monthlyProgress.completed} de ${monthlyProgress.total} objetivos atingidos` : "Nenhum objetivo definido"}
          </Badge>
        </div>
        <GradientProgress progress={monthlyProgress} label="Progresso geral do mês" large />
      </section>

      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Escopo</th>
              <th>Progresso</th>
              <th className="numeric">Clientes</th>
              <th className="numeric">Implantação</th>
              <th className="numeric">Recorrente</th>
              <th className="numeric">Receita total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((goal) => {
              const progress = summarizeObjectives(objectivesForGoal(goal));
              return <tr key={goal.id}>
              <td>
                <strong>{goal.label}</strong>
                <div>
                  <Badge tone={goal.scope_type === "project" ? "purple" : "neutral"}>
                    {goal.scope_type === "project" ? "Projeto" : goal.scope_type === "client_projects" ? "Projetos de cliente" : "Holding"}
                  </Badge>
                </div>
              </td>
              <td>
                <div className="goal-row-progress">
                  <div className="goal-row-progress-header">
                    <strong>{progress.percentage}%</strong>
                    <small className="muted">{progress.completed} de {progress.total}</small>
                  </div>
                  <GradientProgress progress={progress} label={`Progresso de ${goal.label}`} />
                </div>
              </td>
              <td className="numeric"><strong>{goal.actual_clients} / {goal.target_clients}</strong></td>
              <td className="numeric">
                <div>{formatMoney(goal.actual_setup_revenue_cents)}</div>
                <small className="muted">meta {formatMoney(goal.target_setup_revenue_cents)}</small>
              </td>
              <td className="numeric">
                <div>{formatMoney(goal.actual_recurring_revenue_cents)}</div>
                <small className="muted">meta {formatMoney(goal.target_recurring_revenue_cents)}</small>
              </td>
              <td className="numeric">
                <strong>{formatMoney(goal.actual_total_revenue_cents)}</strong>
                <div className="muted">meta {formatMoney(goal.target_total_revenue_cents)}</div>
              </td>
              <td>
                <button className="icon-button" onClick={() => openEdit(goal)} aria-label={`Editar meta de ${goal.label}`} title="Editar meta">
                  <Pencil size={14} />
                </button>
              </td>
            </tr>})}
          </tbody>
        </table>
      </section>
    </>}

    <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar meta" : "Nova meta"}>
      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Escopo</label>
          <select className="select" value={scope} onChange={(event) => setScope(event.target.value as GoalRow["scope_type"])} disabled={!!editing}>
            <option value="project">Projeto</option>
            <option value="client_projects">Projetos de cliente (Prodexy)</option>
            <option value="holding">Holding consolidada</option>
          </select>
        </div>
        {scope === "project" && <div className="field">
          <label>Projeto</label>
          <select className="select" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!!editing}>
            <option value="">Selecione</option>
            {lookups.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>}
        <div className="field"><label>Meta de clientes</label><input className="input" type="number" min="0" value={clients} onChange={(event) => setClients(event.target.value)} /></div>
        <div className="field"><label>Implantação</label><input className="input" value={setup} onChange={(event) => setSetup(event.target.value)} /></div>
        <div className="field"><label>Receita recorrente</label><input className="input" value={recurring} onChange={(event) => setRecurring(event.target.value)} /></div>
        <div className="field"><label>Receita total</label><input className="input" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="Vazio = implantação + recorrente" /></div>
        <div className="field full"><label>Observação</label><textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      </div>
      <div className="form-actions">
        <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar meta"}</Button>
      </div>
    </Modal>
  </>;
}
