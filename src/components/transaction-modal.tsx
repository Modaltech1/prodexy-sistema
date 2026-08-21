"use client";

import { useState } from "react";
import { crudCreate, crudUpdate } from "@/lib/client-api";
import { todayInSaoPaulo } from "@/lib/date";
import { calculateFee } from "@/lib/finance";
import { moneyToCents } from "@/lib/money";
import type { FinancialTransaction, TransactionStatus, TransactionType } from "@/lib/types";
import type { Lookups } from "@/lib/use-lookups";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

type TransactionModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lookups: Lookups;
  initialType?: TransactionType;
  transaction?: FinancialTransaction | null;
  defaultProjectId?: string;
};

export function TransactionModal({
  open,
  onClose,
  onSaved,
  lookups,
  initialType = "revenue",
  transaction,
  defaultProjectId = "",
}: TransactionModalProps) {
  if (!open) return null;
  const formKey = transaction?.id || `new:${initialType}:${defaultProjectId}`;
  return <TransactionModalContent key={formKey} onClose={onClose} onSaved={onSaved} lookups={lookups} initialType={initialType} transaction={transaction} defaultProjectId={defaultProjectId} />;
}

function TransactionModalContent({
  onClose,
  onSaved,
  lookups,
  initialType = "revenue",
  transaction,
  defaultProjectId = "",
}: Omit<TransactionModalProps, "open">) {
  const type = transaction?.transaction_type || initialType;
  const [status, setStatus] = useState<TransactionStatus>(transaction?.status || (type === "revenue" ? "received" : "paid"));
  const [date, setDate] = useState(transaction?.transaction_date || todayInSaoPaulo());
  const [projectId, setProjectId] = useState(transaction?.project_id || defaultProjectId);
  const [categoryId, setCategoryId] = useState(transaction?.category_id || "");
  const [description, setDescription] = useState(transaction?.description || "");
  const [value, setValue] = useState(transaction ? (Number(transaction.gross_amount_cents || 0) / 100).toFixed(2).replace(".", ",") : "");
  const [feeProfileId, setFeeProfileId] = useState(transaction?.fee_profile_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = lookups.categories.filter((category) => category.applies_to === "any" || category.applies_to === type);
  const realized = (type === "revenue" && status === "received") || (type === "cost" && status === "paid");

  const save = async () => {
    const amountCents = moneyToCents(value);
    if (!description.trim()) {
      setError("Informe a descrição.");
      return;
    }
    if (amountCents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }

    setSaving(true);
    setError("");

    const competenceMonth = transaction?.id && date === transaction.transaction_date
      ? transaction.competence_month
      : `${date.slice(0, 7)}-01`;
    const payload: Record<string, unknown> = {
      project_id: projectId || null,
      transaction_date: date,
      competence_month: competenceMonth,
      transaction_type: type,
      category_id: categoryId || null,
      description: description.trim(),
      quantity: 1,
      unit_amount_cents: amountCents,
      gross_amount_cents: amountCents,
      fee_profile_id: type === "revenue" ? feeProfileId || null : null,
      status,
      realized_at: realized ? date : null,
      cost_scope: projectId ? "direct" : "holding",
    };

    if (type === "revenue" && feeProfileId) {
      const profile = lookups.feeProfiles.find((fee) => fee.id === feeProfileId);
      if (profile) payload.fee_amount_cents = calculateFee(amountCents, Number(profile.percentage), Number(profile.fixed_amount_cents));
    } else if (!transaction?.id || transaction.fee_profile_id) {
      payload.fee_amount_cents = 0;
    }

    try {
      if (transaction?.id) await crudUpdate("transactions", transaction.id, payload);
      else await crudCreate("transactions", payload);
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (transaction?.subscription_id) {
    return (
      <Modal open title="Mensalidade automática" onClose={onClose} width="560px">
        <div className="note">
          Este lançamento pertence a uma assinatura SaaS. Valor, taxa, cobrança e repasse são administrados na aba SaaS do projeto para manter um único ciclo por competência.
        </div>
        <div className="form-actions"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={transaction ? `Editar ${type === "revenue" ? "receita" : "custo"}` : type === "revenue" ? "Nova receita" : "Novo custo"}
      onClose={onClose}
      width="640px"
    >
      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Status</label>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value as TransactionStatus)}>
            {type === "revenue" ? (
              <><option value="received">Recebido</option><option value="planned">Previsto</option><option value="overdue">Atrasado</option><option value="cancelled">Cancelado</option></>
            ) : (
              <><option value="paid">Pago</option><option value="planned">Previsto</option><option value="overdue">Atrasado</option><option value="cancelled">Cancelado</option></>
            )}
          </select>
        </div>
        <div className="field"><label>Data</label><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <div className="field"><label>Projeto</label><select className="select" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Prodexy Labs / Holding</option>{lookups.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
        <div className="field"><label>Categoria</label><select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <div className="field full"><label>Descrição</label><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={type === "revenue" ? "Ex.: Mensalidade do sistema" : "Ex.: Hospedagem"} /></div>
        <div className="field"><label>Valor</label><input className="input" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" /></div>
        {type === "revenue" && <div className="field"><label>Perfil de taxa</label><select className="select" value={feeProfileId} onChange={(event) => setFeeProfileId(event.target.value)}><option value="">Sem taxa</option>{lookups.feeProfiles.filter((fee) => fee.active).map((fee) => <option key={fee.id} value={fee.id}>{fee.name}</option>)}</select></div>}
      </div>
      <div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar lançamento"}</Button></div>
    </Modal>
  );
}
