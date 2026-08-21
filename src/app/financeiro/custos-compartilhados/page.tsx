"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Plus, Split, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, crudDelete, crudUpdate } from "@/lib/client-api";
import { currentCompetence, formatDate, todayInSaoPaulo } from "@/lib/date";
import { formatMoney, formatPercent, moneyToCents } from "@/lib/money";
import { calculateParticipationImpact } from "@/lib/participation-impact";
import type { ParticipationRecord } from "@/lib/participation-impact";
import { splitEvenly, validateSharedCostAllocations } from "@/lib/shared-costs";
import type { FinancialTransaction } from "@/lib/types";
import { useLookups } from "@/lib/use-lookups";

type AllocationMethod = "equal" | "manual";

type SharedCostAllocation = {
  id: string;
  transaction_id: string;
  project_id: string;
  allocated_amount_cents: number;
};

export default function SharedCostsPage() {
  const lookups = useLookups();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [allocations, setAllocations] = useState<SharedCostAllocation[]>([]);
  const [projectPartners, setProjectPartners] = useState<ParticipationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState(todayInSaoPaulo());
  const [month, setMonth] = useState(currentCompetence().slice(0, 7));
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [provider, setProvider] = useState("");
  const [value, setValue] = useState("");
  const [projectShareValue, setProjectShareValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<AllocationMethod>("equal");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [transactionRows, allocationRows, participationRows] = await Promise.all([
        apiFetch<FinancialTransaction[]>("/api/crud/transactions?cost_scope=shared&transaction_type=cost&limit=1000"),
        apiFetch<SharedCostAllocation[]>("/api/crud/allocations?limit=2000"),
        apiFetch<ParticipationRecord[]>("/api/crud/project-partners?limit=2000"),
      ]);
      setTransactions(transactionRows.filter((transaction) => !transaction.archived));
      setAllocations(allocationRows);
      setProjectPartners(participationRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const projectMap = useMemo(
    () => new Map(lookups.projects.map((project) => [project.id, project.name])),
    [lookups.projects],
  );
  const categoryMap = useMemo(
    () => new Map(lookups.categories.map((category) => [category.id, category.name])),
    [lookups.categories],
  );

  const total = moneyToCents(value);
  const projectShare = moneyToCents(projectShareValue);
  const preview = useMemo(() => {
    if (method === "equal") return splitEvenly(projectShare, selected);
    return selected.map((projectId) => ({
      project_id: projectId,
      allocated_amount_cents: moneyToCents(manual[projectId] || "0"),
    }));
  }, [manual, method, projectShare, selected]);
  const validation = useMemo(
    () => validateSharedCostAllocations(total, preview),
    [preview, total],
  );

  const toggle = (projectId: string) => {
    setSelected((current) => current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId]);
  };

  const resetForm = () => {
    setDescription("");
    setCategoryId("");
    setProvider("");
    setValue("");
    setProjectShareValue("");
    setSelected([]);
    setMethod("equal");
    setManual({});
    setError("");
  };

  const save = async () => {
    if (!description.trim()) {
      setError("Informe a descrição do custo.");
      return;
    }
    if (validation.error) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/shared-costs", {
        method: "POST",
        body: JSON.stringify({
          transaction_date: date,
          competence_month: `${month}-01`,
          category_id: categoryId || null,
          description: description.trim(),
          gross_amount_cents: total,
          unit_amount_cents: total,
          quantity: 1,
          fee_amount_cents: 0,
          status: "paid",
          provider: provider.trim() || null,
          allocations: preview.map((allocation) => ({
            project_id: allocation.project_id,
            allocated_amount_cents: allocation.allocated_amount_cents,
            allocation_method: method,
            percentage: total > 0 ? allocation.allocated_amount_cents / total * 100 : null,
          })),
        }),
      });
      setOpen(false);
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    await crudUpdate("transactions", id, { status: "paid", realized_at: todayInSaoPaulo() });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Arquivar este custo compartilhado? As alocações deixarão de entrar nos cálculos.")) return;
    await crudDelete("transactions", id);
    await load();
  };

  return <>
    <PageHeader
      title="Custos compartilhados"
      description="Uma despesa real da holding, com somente a parcela utilizada por cada projeto atribuída ao resultado dele."
      actions={<Button onClick={() => setOpen(true)}><Plus size={15} /> Novo custo compartilhado</Button>}
    />

    <div className="note" style={{ marginBottom: 14 }}>
      <strong>Ordem correta:</strong> primeiro o custo original é dividido entre holding e projetos. Depois, somente dentro de cada projeto, a parcela atribuída é decomposta pela composição societária.
    </div>

    {loading ? <LoadingBlock lines={6} /> : <section className="panel table-wrap">
      {transactions.length === 0 ? <EmptyState title="Nenhum custo compartilhado" description="Cadastre Vercel, AWS ou outra despesa usada por múltiplos projetos." /> : <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Provedor</th><th>Status</th><th>Destino do custo</th><th className="numeric">Custo original</th><th></th></tr></thead>
        <tbody>{transactions.map((transaction) => {
          const transactionAllocations = allocations.filter((allocation) => allocation.transaction_id === transaction.id);
          const originalCost = Number(transaction.gross_amount_cents) + Number(transaction.fee_amount_cents);
          const allocatedCost = transactionAllocations.reduce((sum, allocation) => sum + Number(allocation.allocated_amount_cents || 0), 0);
          const holdingRemainder = Math.max(0, originalCost - allocatedCost);

          return <tr key={transaction.id}>
            <td>{formatDate(transaction.transaction_date)}</td>
            <td><strong>{transaction.description}</strong>{transaction.source === "recurrence" && <div className="muted">Gerado por recorrência</div>}</td>
            <td>{categoryMap.get(transaction.category_id) || "—"}</td>
            <td>{transaction.provider || "—"}</td>
            <td>{transaction.status === "paid" ? "Pago" : transaction.status === "planned" ? "Previsto" : transaction.status === "overdue" ? "Atrasado" : transaction.status}</td>
            <td><div className="allocation-breakdown">
              {transactionAllocations.map((allocation) => {
                const impact = calculateParticipationImpact(
                  Number(allocation.allocated_amount_cents || 0),
                  allocation.project_id,
                  transaction.competence_month,
                  projectPartners,
                  lookups.partners,
                );
                return <div key={allocation.id}>
                  <strong>{projectMap.get(allocation.project_id) || "Projeto"}: {formatMoney(allocation.allocated_amount_cents)}</strong>
                  <small>{impact.valid
                    ? `Dentro do projeto: ${impact.shares.map((share) => `${share.partnerName} ${formatMoney(share.amountCents)}`).join(" · ")}`
                    : `Composição incompleta (${formatPercent(impact.totalPercentage, 2)})`}</small>
                </div>;
              })}
              {holdingRemainder > 0 && <div>
                <strong><Building2 size={13} /> Prodexy / Holding: {formatMoney(holdingRemainder)}</strong>
                <small>Parcela não atribuída aos projetos</small>
              </div>}
            </div></td>
            <td className="numeric"><strong>{formatMoney(originalCost)}</strong></td>
            <td><div className="inline-actions">
              {transaction.status !== "paid" && transaction.status !== "cancelled" && <button className="icon-button" title="Marcar como pago" onClick={() => void markPaid(transaction.id)}><Check size={14} /></button>}
              <button className="icon-button" title="Arquivar" onClick={() => void remove(transaction.id)}><Trash2 size={14} /></button>
            </div></td>
          </tr>;
        })}</tbody>
      </table>}
    </section>}

    <Modal open={open} onClose={() => setOpen(false)} title="Novo custo compartilhado" width="760px">
      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-grid">
        <div className="field"><label>Data</label><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <div className="field"><label>Competência</label><input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
        <div className="field full"><label>Descrição</label><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Banco de dados" /></div>
        <div className="field"><label>Categoria</label><select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sem categoria</option>{lookups.categories.filter((category) => category.applies_to !== "revenue").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <div className="field"><label>Provedor</label><input className="input" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Vercel, AWS..." /></div>
        <div className="field"><label>Custo original</label><input className="input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" inputMode="decimal" /></div>
        <div className="field"><label>Método</label><select className="select" value={method} onChange={(event) => setMethod(event.target.value as AllocationMethod)}><option value="equal">Divisão igual entre projetos</option><option value="manual">Valor por projeto</option></select></div>
        {method === "equal" && <div className="field full"><label>Total destinado aos projetos</label><input className="input" value={projectShareValue} onChange={(event) => setProjectShareValue(event.target.value)} placeholder="Ex.: 75,00" inputMode="decimal" /><small className="muted">O saldo entre o custo original e este valor permanece na Prodexy / Holding.</small></div>}
        <div className="field full"><label>Projetos participantes</label><div className="panel" style={{ padding: 10, display: "grid", gap: 7 }}>
          {lookups.projects.filter((project) => project.status === "active").map((project) => {
            const checked = selected.includes(project.id);
            const amount = preview.find((allocation) => allocation.project_id === project.id)?.allocated_amount_cents || 0;
            return <label key={project.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(project.id)} />
              <span style={{ flex: 1 }}>{project.name}</span>
              {checked && method === "manual" && <input className="input" style={{ width: 130 }} value={manual[project.id] || ""} onChange={(event) => setManual((current) => ({ ...current, [project.id]: event.target.value }))} placeholder="0,00" inputMode="decimal" />}
              {checked && method === "equal" && <strong>{formatMoney(amount)}</strong>}
            </label>;
          })}
        </div></div>
        <div className="field full"><div className={!validation.error && total > 0 ? "success-box" : "note"}>
          <Split size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Projetos: <strong>{formatMoney(validation.allocatedCents)}</strong> · Holding: <strong>{formatMoney(Math.max(0, validation.holdingRemainderCents))}</strong> · Original: <strong>{formatMoney(total)}</strong>
        </div></div>
      </div>
      <div className="form-actions"><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar custo"}</Button></div>
    </Modal>
  </>;
}
