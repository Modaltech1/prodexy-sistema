"use client";

import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  summarizePartnerProjects,
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
        </>
      )}
    </section>
  );
}
