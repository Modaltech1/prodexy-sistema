"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/client-api";
import { calculateFee } from "@/lib/finance";
import { currentCompetence, formatDate } from "@/lib/date";
import { centsToInput, formatMoney, moneyToCents } from "@/lib/money";
import type { FeeProfile, FinancialTransaction, Subscription } from "@/lib/types";

type Plan = { id: string; name: string; monthly_amount_cents: number };
type Client = { id: string; name: string; status: string };
type SyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped_closed: number;
  subscriptions_synced: number;
  subscriptions_pending_configuration: number;
};

const subscriptionStatusLabels: Record<Subscription["status"], string> = {
  active: "Ativa",
  trial: "Teste",
  overdue: "Em atraso",
  cancelled: "Cancelada",
};

function cycleLabel(transaction?: FinancialTransaction) {
  if (!transaction) return { label: "Sem ciclo gerado", tone: "neutral" as const, detail: "Sincronização pendente" };
  if (transaction.customer_payment_status === "failed") return { label: "Falha na cobrança", tone: "negative" as const, detail: formatDate(transaction.transaction_date) };
  if (transaction.customer_payment_status === "refunded") return { label: "Reembolsada", tone: "neutral" as const, detail: formatDate(transaction.customer_paid_at) };
  if (transaction.status === "received") return { label: "Recebida", tone: "positive" as const, detail: formatDate(transaction.realized_at) };
  if (transaction.customer_payment_status === "paid") return { label: "Cliente pagou", tone: "info" as const, detail: `Repasse previsto ${formatDate(transaction.expected_receipt_date)}` };
  return { label: "Cobrança agendada", tone: "warning" as const, detail: formatDate(transaction.transaction_date) };
}

export function SaasSubscriptionsPanel({
  projectId,
  plans,
  subscriptions,
  clients,
  feeProfiles,
  transactions,
  onChanged,
}: {
  projectId: string;
  plans: Plan[];
  subscriptions: Subscription[];
  clients: Client[];
  feeProfiles: FeeProfile[];
  transactions: FinancialTransaction[];
  onChanged: () => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [feeProfileId, setFeeProfileId] = useState("");
  const [billingDay, setBillingDay] = useState("11");
  const [payoutDay, setPayoutDay] = useState("10");
  const [payoutOffset, setPayoutOffset] = useState("1");
  const [startMonth, setStartMonth] = useState(currentCompetence().slice(0, 7));
  const [status, setStatus] = useState<Subscription["status"]>("active");
  const [automatic, setAutomatic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const feeMap = useMemo(() => new Map(feeProfiles.map((fee) => [fee.id, fee])), [feeProfiles]);
  const latestCycleBySubscription = useMemo(() => {
    const map = new Map<string, FinancialTransaction>();
    for (const transaction of transactions) {
      if (!transaction.subscription_id || transaction.archived) continue;
      const current = map.get(transaction.subscription_id);
      if (!current || transaction.competence_month > current.competence_month) map.set(transaction.subscription_id, transaction);
    }
    return map;
  }, [transactions]);

  const openNew = () => {
    setEditing(null);
    setClientId("");
    setPlanId("");
    setAmount("");
    setFeeProfileId(feeProfiles.find((fee) => fee.name.toLowerCase().includes("stripe"))?.id || "");
    setBillingDay("11");
    setPayoutDay("10");
    setPayoutOffset("1");
    setStartMonth(currentCompetence().slice(0, 7));
    setStatus("active");
    setAutomatic(true);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (subscription: Subscription) => {
    setEditing(subscription);
    setClientId(subscription.client_id);
    setPlanId(subscription.plan_id || "");
    setAmount(centsToInput(subscription.monthly_amount_cents));
    setFeeProfileId(subscription.fee_profile_id || "");
    setBillingDay(String(subscription.billing_day || 11));
    setPayoutDay(String(subscription.payout_day || 10));
    setPayoutOffset(String(subscription.payout_month_offset ?? 1));
    setStartMonth((subscription.automatic_billing_start_month || currentCompetence()).slice(0, 7));
    setStatus(subscription.status);
    setAutomatic(subscription.automatic_billing ?? false);
    setError("");
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...(editing ? { id: editing.id } : { project_id: projectId, client_id: clientId }),
        plan_id: planId || null,
        monthly_amount_cents: moneyToCents(amount),
        fee_profile_id: feeProfileId || null,
        billing_day: Number(billingDay),
        payout_day: Number(payoutDay),
        payout_month_offset: Number(payoutOffset),
        automatic_billing_start_month: `${startMonth}-01`,
        automatic_billing: automatic,
        status,
      };
      await apiFetch("/api/saas/subscriptions", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setModalOpen(false);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a assinatura.");
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setFeedback("");
    try {
      const result = await apiFetch<SyncResult>("/api/saas/billing/sync", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId }),
      });
      const changes = result.created + result.updated;
      setFeedback(
        result.subscriptions_synced
          ? `${changes} ciclo(s) atualizado(s); ${result.unchanged} já estava(m) em dia${result.skipped_closed ? `; ${result.skipped_closed} mês(es) fechado(s) preservado(s)` : ""}.`
          : "Nenhuma assinatura está pronta para sincronizar. Configure cobrança, repasse e início da automação.",
      );
      await onChanged();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Não foi possível sincronizar as mensalidades.");
    } finally {
      setSyncing(false);
    }
  };

  const availableClients = clients.filter((client) =>
    client.status === "active"
    && (client.id === clientId || !subscriptions.some((subscription) =>
      subscription.client_id === client.id && ["active", "trial", "overdue"].includes(subscription.status),
    )),
  );

  return (
    <section className="panel saas-subscriptions-panel">
      <div className="panel-header saas-subscriptions-header">
        <div>
          <h2>Assinaturas e mensalidades</h2>
          <span>{subscriptions.filter((subscription) => subscription.status === "active").length} assinatura(s) ativa(s)</span>
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={sync} disabled={syncing || !subscriptions.length}>
            <RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Sincronizando" : "Sincronizar"}
          </Button>
          <Button variant="secondary" onClick={openNew}><Plus size={14} /> Assinatura</Button>
        </div>
      </div>
      {feedback && <div className="saas-sync-feedback">{feedback}</div>}
      <div className="saas-calendar-note">
        <CalendarClock size={17} />
        <span>Modo calendário: cobrança e repasse são atualizados pelas datas configuradas. A conciliação com a Stripe continua sendo a confirmação final.</span>
      </div>
      {subscriptions.length === 0 ? (
        <EmptyState title="Nenhuma assinatura" description="Cadastre a primeira assinatura recorrente deste SaaS." />
      ) : (
        <div className="saas-subscription-list">
          {subscriptions.map((subscription) => {
            const cycle = latestCycleBySubscription.get(subscription.id);
            const cycleState = cycleLabel(cycle);
            const fee = subscription.fee_profile_id ? feeMap.get(subscription.fee_profile_id) : null;
            const calculatedFee = fee
              ? calculateFee(subscription.monthly_amount_cents, Number(fee.percentage), Number(fee.fixed_amount_cents))
              : 0;
            const configured = subscription.automatic_billing && subscription.billing_day && subscription.payout_day && subscription.automatic_billing_start_month;
            return (
              <article className="saas-subscription-row" key={subscription.id}>
                <div className="saas-subscription-client">
                  <strong>{clientMap.get(subscription.client_id)?.name || "Cliente"}</strong>
                  <div className="inline-actions">
                    <Badge tone={subscription.status === "active" ? "positive" : subscription.status === "overdue" ? "negative" : "neutral"}>
                      {subscriptionStatusLabels[subscription.status]}
                    </Badge>
                    {!configured && <Badge tone="warning">Configuração pendente</Badge>}
                  </div>
                </div>
                <div className="saas-subscription-money">
                  <span>Mensalidade bruta</span>
                  <strong>{formatMoney(subscription.monthly_amount_cents)}</strong>
                  <small>{fee ? `${fee.name}: -${formatMoney(calculatedFee)}` : "Sem taxa"} · líquido {formatMoney(subscription.monthly_amount_cents - calculatedFee)}</small>
                </div>
                <div className="saas-subscription-schedule">
                  <span>Ciclo financeiro</span>
                  {configured ? (
                    <><strong>Dia {subscription.billing_day} → dia {subscription.payout_day} {subscription.payout_month_offset ? "do mês seguinte" : "do mesmo mês"}</strong><small>Automação desde {formatDate(subscription.automatic_billing_start_month)}</small></>
                  ) : (
                    <><strong>Automação desativada</strong><small>Edite para configurar</small></>
                  )}
                </div>
                <div className="saas-subscription-cycle">
                  <span>Último ciclo</span>
                  <Badge tone={cycleState.tone}>{cycleState.label}</Badge>
                  <small>{cycleState.detail}</small>
                </div>
                <button className="icon-button" onClick={() => openEdit(subscription)} aria-label="Editar assinatura" title="Editar assinatura">
                  <Pencil size={14} />
                </button>
              </article>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar assinatura" : "Nova assinatura"} width="760px">
        {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Cliente</label>
            <select className="select" value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={Boolean(editing)}>
              <option value="">Selecione</option>
              {availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Plano</label>
            <select className="select" value={planId} onChange={(event) => {
              setPlanId(event.target.value);
              const plan = plans.find((item) => item.id === event.target.value);
              if (plan) setAmount(centsToInput(plan.monthly_amount_cents));
            }}>
              <option value="">Personalizado</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Valor bruto cobrado</label>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
          </div>
          <div className="field">
            <label>Perfil de taxa</label>
            <select className="select" value={feeProfileId} onChange={(event) => setFeeProfileId(event.target.value)}>
              <option value="">Sem taxa</option>
              {feeProfiles.filter((fee) => fee.active && fee.name.toLowerCase() !== "sem taxa").map((fee) => <option key={fee.id} value={fee.id}>{fee.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Dia da cobrança</label>
            <input className="input" type="number" min="1" max="31" value={billingDay} onChange={(event) => setBillingDay(event.target.value)} />
          </div>
          <div className="field">
            <label>Dia do repasse</label>
            <input className="input" type="number" min="1" max="31" value={payoutDay} onChange={(event) => setPayoutDay(event.target.value)} />
          </div>
          <div className="field">
            <label>Quando ocorre o repasse</label>
            <select className="select" value={payoutOffset} onChange={(event) => setPayoutOffset(event.target.value)}>
              <option value="0">No mesmo mês</option>
              <option value="1">No mês seguinte</option>
            </select>
          </div>
          <div className="field">
            <label>Primeira competência</label>
            <input className="input" type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} />
          </div>
          <div className="field">
            <label>Status</label>
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value as Subscription["status"])}>
              <option value="active">Ativa</option>
              <option value="trial">Teste</option>
              <option value="overdue">Em atraso</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>
          <label className="toggle-field">
            <input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />
            <span><strong>Automação por calendário</strong><small>Gera um único ciclo por assinatura e competência.</small></span>
          </label>
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !clientId || !amount || !startMonth}>
            <WalletCards size={14} /> {saving ? "Salvando" : "Salvar assinatura"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
