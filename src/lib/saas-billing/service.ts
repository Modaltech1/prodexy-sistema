import "server-only";

import { calculateFee } from "@/lib/finance";
import { currentCompetence, todayInSaoPaulo } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { billingCycleState, dateInCycleMonth, laterCompetence, listCompetences } from "./calendar";

export type SaasBillingSyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped_closed: number;
  subscriptions_synced: number;
  subscriptions_pending_configuration: number;
};

function changed(existing: Record<string, unknown>, updates: Record<string, unknown>) {
  return Object.entries(updates).some(([key, value]) => (existing[key] ?? null) !== (value ?? null));
}

export async function syncSaasBilling(projectId: string): Promise<SaasBillingSyncResult> {
  const supabase = getSupabaseAdmin();
  const today = todayInSaoPaulo();
  const currentMonth = currentCompetence();
  const result: SaasBillingSyncResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped_closed: 0,
    subscriptions_synced: 0,
    subscriptions_pending_configuration: 0,
  };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,project_type,status")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project || project.project_type !== "saas" || project.status === "archived") {
    throw new Error("A sincronização de mensalidades só pode ser executada em um projeto SaaS ativo.");
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("created_at");
  if (subscriptionsError) throw subscriptionsError;

  const configured = (subscriptions ?? []).filter((subscription) =>
    subscription.automatic_billing
    && subscription.automatic_billing_start_month
    && subscription.billing_day
    && subscription.payout_day,
  );
  result.subscriptions_pending_configuration = (subscriptions ?? []).length - configured.length;
  if (!configured.length) return result;

  const subscriptionIds = configured.map((subscription) => subscription.id);
  const clientIds = [...new Set(configured.map((subscription) => subscription.client_id))];
  const feeIds = [...new Set(configured.map((subscription) => subscription.fee_profile_id).filter(Boolean))];

  const [clientsRes, feesRes, categoryRes, closingsRes, transactionsRes] = await Promise.all([
    supabase.from("clients").select("id,name").in("id", clientIds),
    feeIds.length
      ? supabase.from("fee_profiles").select("id,percentage,fixed_amount_cents").in("id", feeIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("financial_categories").select("id").eq("name", "Mensalidade").maybeSingle(),
    supabase.from("monthly_closings").select("competence_month").eq("project_id", projectId).eq("status", "closed"),
    supabase.from("financial_transactions").select("*").in("subscription_id", subscriptionIds).eq("archived", false).limit(10000),
  ]);
  for (const response of [clientsRes, feesRes, categoryRes, closingsRes, transactionsRes]) {
    if (response.error) throw response.error;
  }

  const clientMap = new Map((clientsRes.data ?? []).map((client) => [client.id, client.name]));
  const feeMap = new Map((feesRes.data ?? []).map((fee) => [fee.id, fee]));
  const closedMonths = new Set((closingsRes.data ?? []).map((closing) => closing.competence_month));
  const transactionMap = new Map((transactionsRes.data ?? []).map((transaction) => [
    `${transaction.subscription_id}:${transaction.competence_month}`,
    transaction,
  ]));

  for (const subscription of configured) {
    const startMonth = laterCompetence(subscription.automatic_billing_start_month, subscription.start_date);
    const competences = listCompetences(startMonth, currentMonth);
    const profile = subscription.fee_profile_id ? feeMap.get(subscription.fee_profile_id) : null;

    for (const competence of competences) {
      const key = `${subscription.id}:${competence}`;
      const existing = transactionMap.get(key);
      const configuredChargeDate = dateInCycleMonth(competence, Number(subscription.billing_day));
      const configuredReceiptDate = dateInCycleMonth(
        competence,
        Number(subscription.payout_day),
        Number(subscription.payout_month_offset ?? 1),
      );
      const cycleWasFrozen = existing && (existing.status === "received" || existing.customer_payment_status === "paid");
      const chargeDate = cycleWasFrozen ? existing.transaction_date : configuredChargeDate;
      const receiptDate = cycleWasFrozen && existing.expected_receipt_date
        ? existing.expected_receipt_date
        : configuredReceiptDate;
      const state = billingCycleState(today, chargeDate, receiptDate);
      const gross = Number(subscription.monthly_amount_cents);
      const fee = profile
        ? calculateFee(gross, Number(profile.percentage), Number(profile.fixed_amount_cents))
        : 0;
      const customerName = clientMap.get(subscription.client_id) || "Cliente SaaS";
      const base = {
        project_id: projectId,
        client_id: subscription.client_id,
        transaction_date: chargeDate,
        competence_month: competence,
        transaction_type: "revenue",
        category_id: categoryRes.data?.id ?? null,
        description: `Mensalidade - ${customerName}`,
        quantity: 1,
        unit_amount_cents: gross,
        gross_amount_cents: gross,
        fee_profile_id: subscription.fee_profile_id || null,
        fee_amount_cents: fee,
        due_date: chargeDate,
        cost_scope: "direct",
        subscription_id: subscription.id,
        customer_payment_status: state.customerPaymentStatus,
        customer_paid_at: state.customerPaidAt,
        expected_receipt_date: receiptDate,
        status: state.transactionStatus,
        realized_at: state.realizedAt,
        source: "recurrence",
        external_reference: `saas:${subscription.id}:${competence.slice(0, 7)}`,
        notes: "Ciclo gerado pela automação por calendário da assinatura SaaS.",
      };

      if (closedMonths.has(competence)) {
        const mayRecordCashReceipt = existing
          && existing.customer_payment_status === "paid"
          && existing.status === "planned"
          && state.transactionStatus === "received";
        if (mayRecordCashReceipt) {
          const lifecycleUpdates = { status: "received", realized_at: state.realizedAt };
          const { data: updated, error } = await supabase
            .from("financial_transactions")
            .update(lifecycleUpdates)
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) throw error;
          transactionMap.set(key, updated);
          result.updated += 1;
        } else {
          result.skipped_closed += 1;
        }
        continue;
      }

      if (!existing) {
        const { data: created, error } = await supabase
          .from("financial_transactions")
          .insert(base)
          .select("*")
          .single();
        if (error) throw error;
        transactionMap.set(key, created);
        result.created += 1;
        continue;
      }

      if (
        existing.status === "cancelled"
        || existing.status === "overdue"
        || ["failed", "refunded"].includes(existing.customer_payment_status)
      ) {
        result.unchanged += 1;
        continue;
      }

      const updates = cycleWasFrozen
        ? {
            status: state.transactionStatus,
            realized_at: state.realizedAt,
          }
        : base;
      if (!changed(existing, updates)) {
        result.unchanged += 1;
        continue;
      }

      const { data: updated, error } = await supabase
        .from("financial_transactions")
        .update(updates)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      transactionMap.set(key, updated);
      result.updated += 1;
    }

    const { error: syncStampError } = await supabase
      .from("subscriptions")
      .update({ last_billing_sync_at: new Date().toISOString() })
      .eq("id", subscription.id);
    if (syncStampError) throw syncStampError;
    result.subscriptions_synced += 1;
  }

  return result;
}
