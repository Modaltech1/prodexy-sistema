"use client";

import { useEffect, useMemo, useState } from "react";
import { PauseCircle, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, crudCreate, crudDelete } from "@/lib/client-api";
import { todayInSaoPaulo } from "@/lib/date";
import { formatMoney, formatPercent, moneyToCents } from "@/lib/money";
import { useLookups } from "@/lib/use-lookups";
import { SettingsNavigation, type SettingsSection } from "@/components/settings-navigation";

const frequencyLabels: Record<string, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  annual: "Anual",
  custom: "A cada N dias",
};

export default function SettingsPage() {
  const lookups = useLookups();
  const [tab, setTab] = useState<SettingsSection>("fees");
  const [recFin, setRecFin] = useState<any[]>([]);
  const [recTasks, setRecTasks] = useState<any[]>([]);
  const [modal, setModal] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Cadastros simples
  const [name, setName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [fixed, setFixed] = useState("");
  const [applies, setApplies] = useState("any");
  const [bucket, setBucket] = useState("other");
  const [partnerType, setPartnerType] = useState("external");

  // Recorrência financeira
  const [recType, setRecType] = useState<"revenue" | "cost">("cost");
  const [recProject, setRecProject] = useState("");
  const [recCategory, setRecCategory] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recQuantity, setRecQuantity] = useState("1");
  const [recValue, setRecValue] = useState("");
  const [recFee, setRecFee] = useState("");
  const [recScope, setRecScope] = useState<"direct" | "shared" | "holding">("holding");
  const [recFrequency, setRecFrequency] = useState("monthly");
  const [recInterval, setRecInterval] = useState("1");
  const [recNextDue, setRecNextDue] = useState(todayInSaoPaulo());
  const [allocationMode, setAllocationMode] = useState<"equal" | "manual">("equal");
  const [projectAllocationPercentage, setProjectAllocationPercentage] = useState("100");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [manualPercentages, setManualPercentages] = useState<Record<string, string>>({});

  const loadRecurrences = async () => {
    const [financial, tasks] = await Promise.all([
      apiFetch<any[]>("/api/crud/recurring-financials?limit=1000"),
      apiFetch<any[]>("/api/crud/recurring-tasks?limit=1000"),
    ]);
    setRecFin(financial);
    setRecTasks(tasks);
  };

  useEffect(() => {
    void loadRecurrences();
  }, []);

  useEffect(() => {
    const syncSection = () => {
      const section = window.location.hash.slice(1) as SettingsSection;
      if (["fees", "categories", "partners", "recurrences"].includes(section)) setTab(section);
    };
    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);

  const selectSection = (section: SettingsSection) => {
    setTab(section);
    window.history.replaceState(null, "", `#${section}`);
  };

  const projectMap = useMemo(() => new Map(lookups.projects.map((project) => [project.id, project.name])), [lookups.projects]);

  const reset = () => {
    setName("");
    setPercentage("");
    setFixed("");
    setApplies("any");
    setBucket("other");
    setPartnerType("external");
    setRecType("cost");
    setRecProject("");
    setRecCategory("");
    setRecDescription("");
    setRecQuantity("1");
    setRecValue("");
    setRecFee("");
    setRecScope("holding");
    setRecFrequency("monthly");
    setRecInterval("1");
    setRecNextDue(todayInSaoPaulo());
    setAllocationMode("equal");
    setProjectAllocationPercentage("100");
    setSelectedProjects([]);
    setManualPercentages({});
    setError("");
  };

  const openModal = (kind: string) => {
    reset();
    setModal(kind);
  };

  const saveSimple = async () => {
    if (!name.trim()) {
      setError("Nome obrigatório.");
      return;
    }
    try {
      if (modal === "fee") {
        await crudCreate("fee-profiles", {
          name: name.trim(),
          percentage: Number(percentage.replace(",", ".")) || 0,
          fixed_amount_cents: moneyToCents(fixed),
          active: true,
        });
      }
      if (modal === "category") {
        await crudCreate("categories", { name: name.trim(), applies_to: applies, goal_bucket: bucket, active: true });
      }
      if (modal === "partner") {
        await crudCreate("partners", { name: name.trim(), partner_type: partnerType, active: true });
      }
      setModal(null);
      reset();
      await lookups.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao salvar.");
    }
  };

  const saveFinancialRecurrence = async () => {
    if (!name.trim() || !recDescription.trim()) {
      setError("Informe nome e descrição.");
      return;
    }
    if (!recValue.trim() || moneyToCents(recValue) <= 0) {
      setError("Informe um valor unitário maior que zero.");
      return;
    }
    if (recType === "cost" && recScope === "direct" && !recProject) {
      setError("Custo direto precisa de um projeto.");
      return;
    }
    if (recType === "cost" && recScope === "shared" && selectedProjects.length === 0) {
      setError("Selecione os projetos participantes do rateio.");
      return;
    }

    let allocations: Array<{ project_id: string; percentage: number }> = [];
    if (recType === "cost" && recScope === "shared") {
      if (allocationMode === "equal") {
        const allocatedPercentage = Number(projectAllocationPercentage.replace(",", "."));
        if (!Number.isFinite(allocatedPercentage) || allocatedPercentage <= 0 || allocatedPercentage > 100) {
          setError("O percentual destinado aos projetos deve ser maior que 0% e no máximo 100%.");
          return;
        }
        const percentageEach = allocatedPercentage / selectedProjects.length;
        allocations = selectedProjects.map((projectId) => ({ project_id: projectId, percentage: percentageEach }));
      } else {
        allocations = selectedProjects.map((projectId) => ({
          project_id: projectId,
          percentage: Number((manualPercentages[projectId] || "0").replace(",", ".")) || 0,
        }));
        const sum = allocations.reduce((total, allocation) => total + allocation.percentage, 0);
        if (sum <= 0 || sum > 100.0001) {
          setError(`O total destinado aos projetos deve ser maior que 0% e no máximo 100%. Atual: ${sum.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%.`);
          return;
        }
      }
    }

    try {
      await apiFetch("/api/recurring-financials", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          project_id: recType === "cost" && recScope === "shared" ? null : recProject || null,
          transaction_type: recType,
          category_id: recCategory || null,
          description: recDescription.trim(),
          quantity: Number(recQuantity.replace(",", ".")) || 1,
          unit_amount_cents: moneyToCents(recValue),
          fee_profile_id: recFee || null,
          cost_scope: recType === "revenue" ? (recProject ? "direct" : "holding") : recScope,
          frequency: recFrequency,
          interval_count: Math.max(1, Number(recInterval) || 1),
          next_due_date: recNextDue,
          allocations,
        }),
      });
      setModal(null);
      reset();
      await loadRecurrences();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao salvar recorrência.");
    }
  };

  const runRecurrences = async () => {
    try {
      const result = await apiFetch<any>("/api/recurrences/run", { method: "POST" });
      alert(`Gerado: ${result.tasks_created} demanda(s) e ${result.financial_created} lançamento(s).`);
      await loadRecurrences();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Não foi possível gerar as recorrências.");
    }
  };

  const deactivateFinancialRecurrence = async (id: string) => {
    if (!confirm("Pausar esta recorrência financeira? Os lançamentos já gerados serão preservados.")) return;
    await crudDelete("recurring-financials", id);
    await loadRecurrences();
  };

  const filteredCategories = lookups.categories.filter((category) => category.applies_to === "any" || category.applies_to === recType);

  const setRecurrenceType = (value: "revenue" | "cost") => {
    setRecType(value);
    if (value === "revenue") setRecScope(recProject ? "direct" : "holding");
    else if (!recProject) setRecScope("holding");
  };

  const setRecurrenceProject = (value: string) => {
    setRecProject(value);
    if (recType === "cost" && recScope !== "shared") setRecScope(value ? "direct" : "holding");
  };

  const toggleSharedProject = (projectId: string) => {
    setSelectedProjects((current) => current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]);
  };

  return (
    <>
      <PageHeader title="Configurações" description="Cadastros, automações e segurança do workspace." />

      <div className="settings-layout">
        <aside className="settings-navigation-wrap"><SettingsNavigation active={tab} onSelect={selectSection} /></aside>
        <main className="settings-workspace">

      {tab === "fees" && (
        <>
          <div className="section-title"><h2>Perfis de taxa</h2><Button onClick={() => openModal("fee")}><Plus size={14} /> Perfil</Button></div>
          <section className="panel table-wrap">
            <table><thead><tr><th>Nome</th><th className="numeric">Percentual</th><th className="numeric">Fixo</th><th>Status</th></tr></thead><tbody>
              {lookups.feeProfiles.map((fee) => <tr key={fee.id}><td><strong>{fee.name}</strong></td><td className="numeric">{formatPercent(fee.percentage, 3)}</td><td className="numeric">{formatMoney(fee.fixed_amount_cents)}</td><td><Badge tone={fee.active ? "positive" : "neutral"}>{fee.active ? "Ativo" : "Inativo"}</Badge></td></tr>)}
            </tbody></table>
          </section>
          <div className="note" style={{ marginTop: 12 }}>O perfil define como calcular a taxa no momento do lançamento. O valor calculado é salvo na transação, então mudanças futuras no perfil não reescrevem o histórico.</div>
        </>
      )}

      {tab === "categories" && (
        <>
          <div className="section-title"><h2>Categorias financeiras</h2><Button onClick={() => openModal("category")}><Plus size={14} /> Categoria</Button></div>
          <section className="panel table-wrap"><table><thead><tr><th>Nome</th><th>Aplicação</th><th>Grupo de meta</th><th>Status</th></tr></thead><tbody>
            {lookups.categories.map((category) => <tr key={category.id}><td><strong>{category.name}</strong></td><td>{category.applies_to}</td><td>{category.goal_bucket}</td><td><Badge tone={category.active ? "positive" : "neutral"}>{category.active ? "Ativa" : "Inativa"}</Badge></td></tr>)}
          </tbody></table></section>
        </>
      )}

      {tab === "partners" && (
        <>
          <div className="section-title"><h2>Participantes</h2><Button onClick={() => openModal("partner")}><Plus size={14} /> Participante</Button></div>
          <section className="panel table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Status</th></tr></thead><tbody>
            {lookups.partners.map((partner) => <tr key={partner.id}><td><strong>{partner.name}</strong></td><td>{partner.partner_type === "holding" ? "Holding / Prodexy" : "Sócio externo"}</td><td><Badge tone={partner.active ? "positive" : "neutral"}>{partner.active ? "Ativo" : "Inativo"}</Badge></td></tr>)}
          </tbody></table></section>
          <div className="note" style={{ marginTop: 12 }}>Cadastre a pessoa aqui e configure o percentual dentro de cada projeto. Participações usam vigência para que mudanças futuras não alterem meses anteriores.</div>
        </>
      )}

      {tab === "recurrences" && (
        <>
          <div className="section-title">
            <div><h2>Recorrências</h2><p>Templates geram previsões; somente o pagamento/recebimento efetivo entra no caixa realizado.</p></div>
            <div className="inline-actions"><Button onClick={() => openModal("recurring-financial")}><Plus size={14} /> Financeira</Button><Button variant="secondary" onClick={runRecurrences}><RefreshCw size={14} /> Gerar vencidas agora</Button></div>
          </div>
          <div className="grid-2">
            <section className="panel">
              <div className="panel-header"><h2>Financeiras</h2></div>
              <div className="panel-body">
                {recFin.filter((row) => row.active).map((row) => (
                  <div className="alert-row" key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.transaction_type === "revenue" ? "Receita" : "Custo"} · {frequencyLabels[row.frequency] || row.frequency} · próxima {row.next_due_date || "não definida"}</small>
                      <small>{row.project_id ? projectMap.get(row.project_id) : row.cost_scope === "shared" ? "Custo compartilhado" : "Prodexy / Holding"} · {formatMoney(Number(row.unit_amount_cents) * Number(row.quantity || 1))}</small>
                    </div>
                    <button className="icon-button" onClick={() => void deactivateFinancialRecurrence(row.id)} title="Pausar recorrência"><PauseCircle size={15} /></button>
                  </div>
                ))}
                {recFin.filter((row) => row.active).length === 0 && <EmptyState title="Nenhuma recorrência financeira" description="Cadastre mensalidades, domínios, infraestrutura ou outras previsões recorrentes." />}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Demandas</h2></div>
              <div className="panel-body">
                {recTasks.filter((row) => row.active).map((row) => <div className="alert-row" key={row.id}><div><strong>{row.title}</strong><small>{frequencyLabels[row.frequency] || row.frequency} · próxima {row.next_run_date || "não definida"}</small></div></div>)}
                {recTasks.filter((row) => row.active).length === 0 && <EmptyState title="Nenhuma demanda recorrente" description="Crie recorrências diretamente no módulo Demandas." />}
              </div>
            </section>
          </div>
        </>
      )}
        </main>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        width={modal === "recurring-financial" ? "820px" : "640px"}
        title={modal === "fee" ? "Novo perfil de taxa" : modal === "category" ? "Nova categoria" : modal === "partner" ? "Novo participante" : "Nova recorrência financeira"}
      >
        {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}

        {modal !== "recurring-financial" ? (
          <>
            <div className="form-grid">
              <div className="field full"><label>Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              {modal === "fee" && <><div className="field"><label>Percentual (%)</label><input className="input" value={percentage} onChange={(e) => setPercentage(e.target.value)} placeholder="4,69" /></div><div className="field"><label>Valor fixo</label><input className="input" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="0,39" /></div></>}
              {modal === "category" && <><div className="field"><label>Aplicação</label><select className="select" value={applies} onChange={(e) => setApplies(e.target.value)}><option value="any">Receita e custo</option><option value="revenue">Receita</option><option value="cost">Custo</option></select></div><div className="field"><label>Grupo de meta</label><select className="select" value={bucket} onChange={(e) => setBucket(e.target.value)}><option value="other">Outro</option><option value="recurring">Recorrente</option><option value="implementation">Implantação</option></select></div></>}
              {modal === "partner" && <div className="field"><label>Tipo</label><select className="select" value={partnerType} onChange={(e) => setPartnerType(e.target.value)}><option value="external">Sócio externo</option><option value="holding">Holding / interno</option></select></div>}
            </div>
            <div className="form-actions"><Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={saveSimple}>Salvar</Button></div>
          </>
        ) : (
          <>
            <div className="form-grid">
              <div className="field full"><label>Nome da recorrência</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vercel Pro" /></div>
              <div className="field"><label>Tipo</label><select className="select" value={recType} onChange={(e) => setRecurrenceType(e.target.value as "revenue" | "cost")}><option value="cost">Custo</option><option value="revenue">Receita</option></select></div>
              <div className="field"><label>Projeto</label><select className="select" value={recProject} disabled={recType === "cost" && recScope === "shared"} onChange={(e) => setRecurrenceProject(e.target.value)}><option value="">Prodexy / Holding</option>{lookups.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
              {recType === "cost" && <div className="field"><label>Escopo</label><select className="select" value={recScope} onChange={(e) => { const value = e.target.value as any; setRecScope(value); if (value === "shared" || value === "holding") setRecProject(""); }}><option value="holding">Holding</option><option value="direct">Direto de projeto</option><option value="shared">Compartilhado</option></select></div>}
              <div className="field"><label>Categoria</label><select className="select" value={recCategory} onChange={(e) => setRecCategory(e.target.value)}><option value="">Sem categoria</option>{filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="field"><label>Perfil de taxa</label><select className="select" value={recFee} onChange={(e) => setRecFee(e.target.value)}><option value="">Sem taxa</option>{lookups.feeProfiles.filter((fee) => fee.active).map((fee) => <option key={fee.id} value={fee.id}>{fee.name}</option>)}</select></div>
              <div className="field full"><label>Descrição do lançamento gerado</label><input className="input" value={recDescription} onChange={(e) => setRecDescription(e.target.value)} placeholder="Ex.: Assinatura mensal da Vercel" /></div>
              <div className="field"><label>Quantidade</label><input className="input" inputMode="decimal" value={recQuantity} onChange={(e) => setRecQuantity(e.target.value)} /></div>
              <div className="field"><label>Valor unitário</label><input className="input" inputMode="decimal" value={recValue} onChange={(e) => setRecValue(e.target.value)} placeholder="0,00" /></div>
              <div className="field"><label>Frequência</label><select className="select" value={recFrequency} onChange={(e) => setRecFrequency(e.target.value)}><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="annual">Anual</option><option value="custom">A cada N dias</option></select></div>
              <div className="field"><label>{recFrequency === "custom" ? "Intervalo em dias" : "A cada"}</label><input className="input" type="number" min="1" value={recInterval} onChange={(e) => setRecInterval(e.target.value)} /></div>
              <div className="field"><label>Próximo vencimento</label><input className="input" type="date" value={recNextDue} onChange={(e) => setRecNextDue(e.target.value)} /></div>

              {recType === "cost" && recScope === "shared" && (
                <div className="field full">
                  <label>Rateio recorrente</label>
                  <div className="recurrence-allocation-box">
                    <div className="inline-actions" style={{ marginBottom: 10 }}>
                      <button className={`segmented-button ${allocationMode === "equal" ? "active" : ""}`} onClick={() => setAllocationMode("equal")} type="button">Divisão igual</button>
                      <button className={`segmented-button ${allocationMode === "manual" ? "active" : ""}`} onClick={() => setAllocationMode("manual")} type="button">Percentual manual</button>
                    </div>
                    {allocationMode === "equal" && <div className="field" style={{ marginBottom: 10 }}><label>Percentual total destinado aos projetos</label><input className="input" value={projectAllocationPercentage} onChange={(event) => setProjectAllocationPercentage(event.target.value)} inputMode="decimal" placeholder="100" /></div>}
                    {lookups.projects.map((project) => {
                      const checked = selectedProjects.includes(project.id);
                      const totalPercentage = Number(projectAllocationPercentage.replace(",", ".")) || 0;
                      const equalPercentage = selectedProjects.length ? totalPercentage / selectedProjects.length : 0;
                      return <label className="allocation-option" key={project.id}>
                        <span><input type="checkbox" checked={checked} onChange={() => toggleSharedProject(project.id)} /> {project.name}</span>
                        {checked && <span className="allocation-percent">{allocationMode === "equal" ? `${equalPercentage.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%` : <input className="input" value={manualPercentages[project.id] || ""} onChange={(e) => setManualPercentages((current) => ({ ...current, [project.id]: e.target.value }))} placeholder="0,00" />}</span>}
                      </label>;
                    })}
                  </div>
                  <small className="muted">O percentual não destinado aos projetos permanece na holding. O consolidado continua contando a despesa original uma única vez.</small>
                </div>
              )}
            </div>
            <div className="form-actions"><Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={saveFinancialRecurrence}>Salvar recorrência</Button></div>
          </>
        )}
      </Modal>
    </>
  );
}
