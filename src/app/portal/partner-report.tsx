"use client";

import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  summarizePartnerProjects,
  type PartnerReportMovement,
  type PartnerPaymentStatus,
  type PartnerReportData,
  type PartnerReportProject,
} from "@/lib/partner-report/contracts";

type ApiResponse = { data?: PartnerReportData; error?: string };

function monthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function projectTypeLabel(type: string) {
  if (type === "saas") return "SaaS";
  if (type === "holding") return "Holding";
  return "Projeto de cliente";
}

function paymentLabel(status: PartnerPaymentStatus) {
  if (status === "paid") return "Pago";
  if (status === "pending") return "Pendente";
  if (status === "cancelled") return "Cancelado";
  if (status === "mixed") return "Status misto";
  return "Sem pagamento";
}

function paymentTone(status: PartnerPaymentStatus): "positive" | "warning" | "negative" | "neutral" {
  if (status === "paid") return "positive";
  if (status === "pending" || status === "mixed") return "warning";
  if (status === "cancelled") return "negative";
  return "neutral";
}

function shareText(project: PartnerReportProject) {
  return project.partnerShareCents === null ? "Indisponível" : formatMoney(project.partnerShareCents);
}

function ShareState({ project }: { project: PartnerReportProject }) {
  if (project.shareKind === "unavailable") return <Badge tone="warning">Composição incompleta</Badge>;
  if (project.shareKind === "confirmed") return <Badge tone="positive">Confirmado</Badge>;
  return <Badge tone="info">Estimativa</Badge>;
}

function ProjectStatus({ project }: { project: PartnerReportProject }) {
  return project.closed
    ? <Badge tone="positive"><CheckCircle2 size={12} /> Fechado</Badge>
    : <Badge tone="info"><Clock3 size={12} /> Em andamento</Badge>;
}

function ProjectTable({ projects }: { projects: PartnerReportProject[] }) {
  return (
    <div className="panel partner-report-desktop">
      <div className="table-wrap">
        <table className="partner-report-table">
          <thead><tr><th>Projeto</th><th>Situação</th><th className="numeric">Participação</th><th className="numeric">Receita líquida</th><th className="numeric">Custos</th><th className="numeric">Resultado</th><th className="numeric">Sua parte</th><th>Pagamento</th></tr></thead>
          <tbody>{projects.map((project) => (
            <tr key={project.id}>
              <td><strong>{project.name}</strong><span className="table-secondary">{projectTypeLabel(project.projectType)}</span></td>
              <td><ProjectStatus project={project} /></td>
              <td className="numeric">{formatPercent(project.participationPercentage, 2)}</td>
              <td className="numeric">{formatMoney(project.revenueNetCents)}</td>
              <td className="numeric">{formatMoney(project.directCostsCents + project.sharedCostsCents)}</td>
              <td className={`numeric ${project.profitCents < 0 ? "negative" : project.profitCents > 0 ? "positive" : ""}`}>{formatMoney(project.profitCents)}</td>
              <td className="numeric"><strong>{shareText(project)}</strong><span className="table-secondary"><ShareState project={project} /></span></td>
              <td>{project.closed ? <Badge tone={paymentTone(project.paymentStatus)}>{paymentLabel(project.paymentStatus)}</Badge> : <span className="muted">Após fechamento</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectCards({ projects }: { projects: PartnerReportProject[] }) {
  return (
    <div className="partner-report-mobile">
      {projects.map((project) => (
        <article className="partner-project-card" key={project.id}>
          <div className="partner-project-heading">
            <div><strong>{project.name}</strong><span>{projectTypeLabel(project.projectType)}</span></div>
            <ProjectStatus project={project} />
          </div>
          <dl>
            <div><dt>Participação</dt><dd>{formatPercent(project.participationPercentage, 2)}</dd></div>
            <div><dt>Receita líquida</dt><dd>{formatMoney(project.revenueNetCents)}</dd></div>
            <div><dt>Custos</dt><dd>{formatMoney(project.directCostsCents + project.sharedCostsCents)}</dd></div>
            <div><dt>Resultado</dt><dd className={project.profitCents < 0 ? "negative" : project.profitCents > 0 ? "positive" : ""}>{formatMoney(project.profitCents)}</dd></div>
          </dl>
          <div className="partner-share-line">
            <div><span>Sua parte</span><strong>{shareText(project)}</strong></div>
            <div className="partner-share-badges"><ShareState project={project} />{project.closed && <Badge tone={paymentTone(project.paymentStatus)}>{paymentLabel(project.paymentStatus)}</Badge>}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FinancialBreakdown({ project }: { project: PartnerReportProject }) {
  const totalCosts = project.directCostsCents + project.sharedCostsCents;
  return (
    <section className="panel partner-breakdown">
      <div className="panel-header"><h2>Demonstrativo de {project.name}</h2><ProjectStatus project={project} /></div>
      <div className="panel-body money-breakdown">
        <div className="money-line"><span>Receita bruta</span><strong>{formatMoney(project.revenueGrossCents)}</strong></div>
        <div className="money-line muted"><span>(-) Taxas financeiras</span><span>{formatMoney(project.revenueFeesCents)}</span></div>
        <div className="money-line"><span>Receita líquida</span><strong>{formatMoney(project.revenueNetCents)}</strong></div>
        <div className="money-line muted"><span>(-) Custos diretos</span><span>{formatMoney(project.directCostsCents)}</span></div>
        <div className="money-line muted"><span>(-) Custos compartilhados rateados</span><span>{formatMoney(project.sharedCostsCents)}</span></div>
        <div className="money-line total"><span>Resultado do projeto</span><strong className={project.profitCents < 0 ? "negative" : project.profitCents > 0 ? "positive" : ""}>{formatMoney(project.profitCents)}</strong></div>
        <div className="partner-breakdown-share">
          <div><span>Sua participação: {formatPercent(project.participationPercentage, 2)}</span><strong>{shareText(project)}</strong></div>
          <ShareState project={project} />
        </div>
        {totalCosts === 0 && project.revenueNetCents === 0 && <p className="partner-breakdown-empty">Não há movimentos financeiros nesta competência.</p>}
      </div>
    </section>
  );
}

function movementKindLabel(kind: PartnerReportMovement["kind"]) {
  if (kind === "revenue") return "Receita";
  if (kind === "shared_cost") return "Custo rateado";
  return "Custo direto";
}

function movementTone(kind: PartnerReportMovement["kind"]): "positive" | "negative" {
  if (kind === "revenue") return "positive";
  return "negative";
}

function movementStatus(status: string) {
  if (status === "received") return { label: "Recebido", tone: "positive" as const };
  if (status === "paid") return { label: "Pago", tone: "positive" as const };
  if (status === "customer_paid") return { label: "Cliente pagou", tone: "info" as const };
  if (status === "overdue") return { label: "Em atraso", tone: "negative" as const };
  if (status === "cancelled") return { label: "Cancelado", tone: "negative" as const };
  return { label: "Previsto", tone: "neutral" as const };
}

function MovementValue({ movement }: { movement: PartnerReportMovement }) {
  return (
    <div className="partner-movement-value">
      <strong className={movement.includedInResult
        ? movement.projectAmountCents < 0 ? "negative" : movement.projectAmountCents > 0 ? "positive" : ""
        : "muted"}
      >{formatMoney(movement.projectAmountCents)}</strong>
      {!movement.includedInResult && <span>Fora do resultado atual</span>}
    </div>
  );
}

function ProjectMovements({ project }: { project: PartnerReportProject }) {
  return (
    <section className="panel partner-movements">
      <div className="panel-header">
        <div><h2>Movimentações de {project.name}</h2><p>{project.movements.length} {project.movements.length === 1 ? "movimentação no período" : "movimentações no período"}</p></div>
        <ProjectStatus project={project} />
      </div>
      {!project.movements.length ? (
        <EmptyState title="Nenhuma movimentação no período" description="Não há receitas, custos diretos ou rateios vinculados a este projeto nesta competência." />
      ) : (
        <>
          <div className="table-wrap partner-movement-desktop">
            <table className="partner-movement-table">
              <thead><tr><th>Data</th><th>Movimentação</th><th>Tipo</th><th>Status</th><th className="numeric">Valor no projeto</th></tr></thead>
              <tbody>{project.movements.map((movement) => {
                const status = movementStatus(movement.status);
                return (
                  <tr key={movement.id}>
                    <td>{formatDate(movement.date)}</td>
                    <td><strong>{movement.description}</strong>{movement.categoryName && <span className="table-secondary">{movement.categoryName}</span>}</td>
                    <td><Badge tone={movementTone(movement.kind)}>{movementKindLabel(movement.kind)}</Badge></td>
                    <td><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td className="numeric"><MovementValue movement={movement} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="partner-movement-mobile">
            {project.movements.map((movement) => {
              const status = movementStatus(movement.status);
              return (
                <article className="partner-movement-card" key={movement.id}>
                  <div className="partner-movement-card-heading"><div><strong>{movement.description}</strong><span>{movement.categoryName ?? movementKindLabel(movement.kind)}</span></div><MovementValue movement={movement} /></div>
                  <div className="partner-movement-card-meta"><span>{formatDate(movement.date)}</span><Badge tone={movementTone(movement.kind)}>{movementKindLabel(movement.kind)}</Badge><Badge tone={status.tone}>{status.label}</Badge></div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function PartnerReport({ initialData, displayName }: { initialData: PartnerReportData; displayName: string }) {
  const [report, setReport] = useState(initialData);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleProjects = useMemo(() => selectedProjectId === "all"
    ? report.projects
    : report.projects.filter((project) => project.id === selectedProjectId), [report.projects, selectedProjectId]);
  const summary = useMemo(() => summarizePartnerProjects(visibleProjects), [visibleProjects]);
  const selectedProject = selectedProjectId === "all" ? null : visibleProjects[0] ?? null;
  const hasOpenProjects = visibleProjects.some((project) => !project.closed);
  const hasInvalidComposition = visibleProjects.some((project) => project.shareKind === "unavailable");

  async function changeMonth(month: string) {
    if (!month) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/partner/report?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.data) throw new Error(payload.error || "Não foi possível carregar o relatório.");
      setReport(payload.data);
      setSelectedProjectId("all");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="portal-content partner-report-content">
      <div className="page-header partner-report-header">
        <div><h1>Relatório financeiro</h1><p>{displayName}, acompanhe sua participação nos projetos em {monthLabel(report.month)}.</p></div>
        <Badge tone="neutral">Somente leitura</Badge>
      </div>

      <div className="filter-bar partner-report-filters">
        <div className="field"><label htmlFor="partner-report-month">Competência</label><input id="partner-report-month" className="input" type="month" value={report.month} onChange={(event) => void changeMonth(event.target.value)} disabled={loading} /></div>
        <div className="field grow"><label htmlFor="partner-report-project">Projeto</label><select id="partner-report-project" className="select" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} disabled={loading || !report.projects.length}><option value="all">Todos os projetos</option>{report.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
        {loading && <div className="partner-report-loading"><RefreshCw size={16} className="spin" /><span>Atualizando</span></div>}
      </div>

      {error && <div className="error-box partner-report-alert"><AlertTriangle size={17} /><span>{error}</span></div>}

      {!visibleProjects.length ? (
        <div className="panel"><EmptyState title="Nenhum projeto nesta competência" description="Não há participação vinculada ao seu acesso para o período selecionado." action={<FolderKanban size={22} />} /></div>
      ) : (
        <>
          <div className="kpi-grid partner-report-kpis">
            <article className="kpi-card"><div className="kpi-top"><span>Receita líquida</span></div><strong>{formatMoney(summary.revenueNetCents)}</strong><small>Receita bruta menos taxas</small></article>
            <article className="kpi-card"><div className="kpi-top"><span>Custos dos projetos</span></div><strong>{formatMoney(summary.directCostsCents + summary.sharedCostsCents)}</strong><small>Diretos e compartilhados rateados</small></article>
            <article className={`kpi-card ${summary.profitCents < 0 ? "kpi-negative" : summary.profitCents > 0 ? "kpi-positive" : ""}`}><div className="kpi-top"><span>Resultado</span></div><strong>{formatMoney(summary.profitCents)}</strong><small>Após taxas e custos</small></article>
            <article className={`kpi-card ${summary.partnerShareCents > 0 ? "kpi-positive" : ""}`}><div className="kpi-top"><span>Sua participação</span></div><strong>{summary.partnerShareComplete ? formatMoney(summary.partnerShareCents) : "Indisponível"}</strong><small>{hasOpenProjects ? "Inclui valores estimados" : "Valores confirmados no fechamento"}</small></article>
          </div>

          {hasOpenProjects && <div className="note partner-report-alert"><Clock3 size={17} /><span>Competências em andamento usam valores atuais e podem mudar até o fechamento.</span></div>}
          {hasInvalidComposition && <div className="warning-box partner-report-alert"><AlertTriangle size={17} /><span>A estimativa fica indisponível enquanto a composição societária do projeto não totalizar 100%.</span></div>}

          <div className="section-title"><h2>Projetos da competência</h2><p>{visibleProjects.length} {visibleProjects.length === 1 ? "projeto" : "projetos"}</p></div>
          <ProjectTable projects={visibleProjects} />
          <ProjectCards projects={visibleProjects} />
          {selectedProject && <FinancialBreakdown project={selectedProject} />}
          {visibleProjects.map((project) => <ProjectMovements key={project.id} project={project} />)}
        </>
      )}
    </section>
  );
}
