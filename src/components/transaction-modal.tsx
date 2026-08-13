"use client";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { crudCreate, crudUpdate } from "@/lib/client-api";
import { moneyToCents, formatMoney } from "@/lib/money";
import { currentCompetence, monthInputFromCompetence, todayInSaoPaulo } from "@/lib/date";
import type { Lookups } from "@/lib/use-lookups";

export function TransactionModal({ open, onClose, onSaved, lookups, initialType = "revenue", transaction, defaultProjectId = "", defaultClientId = "" }: {
  open: boolean; onClose: () => void; onSaved: () => void; lookups: Lookups; initialType?: "revenue"|"cost"; transaction?: any | null; defaultProjectId?: string; defaultClientId?: string;
}) {
  const [type, setType] = useState<"revenue"|"cost">(initialType);
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInSaoPaulo());
  const [month, setMonth] = useState(currentCompetence().slice(0,7));
  const [quantity, setQuantity] = useState("1");
  const [unitValue, setUnitValue] = useState("");
  const [feeProfileId, setFeeProfileId] = useState("");
  const [feeOverride, setFeeOverride] = useState("");
  const [status, setStatus] = useState("received");
  const [dueDate, setDueDate] = useState("");
  const [realizedAt, setRealizedAt] = useState(todayInSaoPaulo());
  const [costScope, setCostScope] = useState<"direct"|"holding">("direct");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.transaction_type); setProjectId(transaction.project_id || ""); setClientId(transaction.client_id || "");
      setCategoryId(transaction.category_id || ""); setDescription(transaction.description || ""); setDate(transaction.transaction_date || todayInSaoPaulo());
      setMonth(monthInputFromCompetence(transaction.competence_month)); setQuantity(String(transaction.quantity ?? 1));
      setUnitValue(((Number(transaction.unit_amount_cents)||0)/100).toFixed(2).replace(".",",")); setFeeProfileId(transaction.fee_profile_id || "");
      setFeeOverride(((Number(transaction.fee_amount_cents)||0)/100).toFixed(2).replace(".",",")); setStatus(transaction.status || (transaction.transaction_type === "revenue" ? "received" : "paid"));
      setDueDate(transaction.due_date || ""); setRealizedAt(transaction.realized_at || transaction.transaction_date || todayInSaoPaulo());
      setCostScope(transaction.cost_scope === "holding" ? "holding" : "direct"); setProvider(transaction.provider || ""); setNotes(transaction.notes || "");
    } else {
      setType(initialType); setProjectId(defaultProjectId); setClientId(defaultClientId); setCategoryId(""); setDescription(""); setDate(todayInSaoPaulo()); setMonth(currentCompetence().slice(0,7)); setQuantity("1"); setUnitValue(""); setFeeProfileId(""); setFeeOverride(""); setStatus(initialType === "revenue" ? "received" : "paid"); setDueDate(""); setRealizedAt(todayInSaoPaulo()); setCostScope("direct"); setProvider(""); setNotes(""); setError("");
    }
  }, [open, transaction, initialType, defaultProjectId, defaultClientId]);

  useEffect(() => { if (type === "revenue" && !["planned","received","overdue","cancelled"].includes(status)) setStatus("received"); if (type === "cost" && !["planned","paid","overdue","cancelled"].includes(status)) setStatus("paid"); }, [type, status]);
  useEffect(() => { if (!projectId && type === "cost") setCostScope("holding"); if (projectId && costScope === "holding") setCostScope("direct"); }, [projectId, type]);

  const grossCents = useMemo(() => Math.round((Number(quantity.replace(",",".")) || 0) * moneyToCents(unitValue)), [quantity, unitValue]);
  const categories = lookups.categories.filter((c) => c.applies_to === "any" || c.applies_to === type);

  const save = async () => {
    if (!description.trim()) { setError("Informe a descrição."); return; }
    if (!unitValue) { setError("Informe o valor unitário."); return; }
    setSaving(true); setError("");
    const payload: any = {
      project_id: projectId || null, client_id: clientId || null, transaction_date: date, competence_month: `${month}-01`, transaction_type: type,
      category_id: categoryId || null, description: description.trim(), quantity: Number(quantity.replace(",",".")) || 1, unit_amount_cents: moneyToCents(unitValue), gross_amount_cents: grossCents,
      fee_profile_id: feeProfileId || null, status, due_date: dueDate || null, realized_at: ((type === "revenue" && status === "received") || (type === "cost" && status === "paid")) ? (realizedAt || date) : null, cost_scope: type === "cost" ? costScope : (projectId ? "direct" : "holding"), provider: provider || null, notes: notes || null,
    };
    if (feeOverride.trim() !== "") payload.fee_amount_cents = moneyToCents(feeOverride);
    try {
      if (transaction?.id) await crudUpdate("transactions", transaction.id, payload); else await crudCreate("transactions", payload);
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  };

  return <Modal open={open} title={transaction ? "Editar lançamento" : type === "revenue" ? "Nova receita" : "Novo custo"} onClose={onClose} width="760px">
    {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
    <div className="form-grid">
      <div className="field"><label>Tipo</label><select className="select" value={type} onChange={(e) => setType(e.target.value as any)}><option value="revenue">Receita</option><option value="cost">Custo</option></select></div>
      <div className="field"><label>Status</label><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{type === "revenue" ? <><option value="received">Recebido</option><option value="planned">Previsto</option><option value="overdue">Atrasado</option><option value="cancelled">Cancelado</option></> : <><option value="paid">Pago</option><option value="planned">Previsto</option><option value="overdue">Atrasado</option><option value="cancelled">Cancelado</option></>}</select></div>
      <div className="field"><label>Data</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)}/></div>
      <div className="field"><label>Competência</label><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)}/></div>
      <div className="field"><label>Vencimento</label><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/></div>
      {((type === "revenue" && status === "received") || (type === "cost" && status === "paid")) && <div className="field"><label>Data de realização</label><input className="input" type="date" value={realizedAt} onChange={(e) => setRealizedAt(e.target.value)}/></div>}
      <div className="field"><label>Projeto</label><select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Prodexy Labs / Holding</option>{lookups.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="field"><label>Cliente</label><select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Sem cliente</option>{lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label>Categoria</label><select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {type === "cost" && <div className="field"><label>Escopo</label><select className="select" value={costScope} disabled={!!projectId} onChange={(e) => setCostScope(e.target.value as any)}><option value="direct">Direto de projeto</option><option value="holding">Holding</option></select></div>}
      <div className="field full"><label>Descrição</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Mensalidade do sistema"/></div>
      <div className="field"><label>Quantidade</label><input className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)}/></div>
      <div className="field"><label>Valor unitário</label><input className="input" inputMode="decimal" value={unitValue} onChange={(e) => setUnitValue(e.target.value)} placeholder="0,00"/></div>
      <div className="field"><label>Perfil de taxa</label><select className="select" value={feeProfileId} onChange={(e) => { setFeeProfileId(e.target.value); setFeeOverride(""); }}><option value="">Sem perfil / taxa manual</option>{lookups.feeProfiles.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div className="field"><label>Taxa manual (opcional)</label><input className="input" inputMode="decimal" value={feeOverride} onChange={(e) => setFeeOverride(e.target.value)} placeholder="Deixe vazio para calcular pelo perfil"/></div>
      <div className="field"><label>Provedor</label><input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Stripe, AWS, Vercel..."/></div>
      <div className="field"><label>Valor bruto calculado</label><input className="input" value={formatMoney(grossCents)} readOnly/></div>
      <div className="field full"><label>Observações</label><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)}/></div>
    </div>
    <div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar lançamento"}</Button></div>
  </Modal>;
}
