import "server-only";
import type {
  PartnerPaymentStatus,
  PartnerReportData,
  PartnerReportMovement,
  PartnerReportProject,
} from "@/lib/partner-report/contracts";
import { calculatePartnerShare } from "@/lib/partner-report/calculation";
import { normalizeMonth } from "@/lib/server-finance";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type LooseRow = Record<string, unknown>;

const COMPOSITION_TOLERANCE = 0.0001;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sum(rows: LooseRow[], field: string) {
  return rows.reduce((total, row) => total + numberValue(row[field]), 0);
}

function resolvePaymentStatus(rows: LooseRow[]): PartnerPaymentStatus {
  const statuses = new Set(rows.map((row) => String(row.payment_status || "")));
  statuses.delete("");
  if (statuses.size === 0) return null;
  if (statuses.size > 1) return "mixed";
  const status = [...statuses][0];
  return status === "pending" || status === "paid" || status === "cancelled" ? status : null;
}

function addRowsByKey(map: Map<string, LooseRow[]>, rows: LooseRow[], field: string) {
  for (const row of rows) {
    const key = String(row[field] || "");
    if (!key) continue;
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
}

function addMovement(map: Map<string, PartnerReportMovement[]>, projectId: string, movement: PartnerReportMovement) {
  const current = map.get(projectId) ?? [];
  current.push(movement);
  map.set(projectId, current);
}

function movementStatus(row: LooseRow) {
  if (
    String(row.transaction_type) === "revenue"
    && String(row.status) !== "received"
    && String(row.customer_payment_status) === "paid"
  ) return "customer_paid";
  return String(row.status || "planned");
}

function sortMovements(movements: PartnerReportMovement[]) {
  return movements.sort((left, right) => (
    right.date.localeCompare(left.date)
    || left.description.localeCompare(right.description, "pt-BR")
    || left.id.localeCompare(right.id)
  ));
}

export async function getPartnerReport(partnerId: string, monthParam?: string | null): Promise<PartnerReportData> {
  const supabase = getSupabaseAdmin();
  const month = normalizeMonth(monthParam);
  const competence = `${month}-01`;

  const [partnerResult, ownParticipationsResult, closingsResult] = await Promise.all([
    supabase.from("partners").select("id,name").eq("id", partnerId).maybeSingle(),
    supabase
      .from("project_partners")
      .select("project_id,participation_percentage")
      .eq("partner_id", partnerId)
      .eq("active", true)
      .lte("start_date", competence)
      .or(`end_date.is.null,end_date.gte.${competence}`),
    supabase
      .from("monthly_closings")
      .select("*")
      .eq("competence_month", competence)
      .eq("status", "closed"),
  ]);

  for (const result of [partnerResult, ownParticipationsResult, closingsResult]) {
    if (result.error) throw result.error;
  }
  if (!partnerResult.data) throw new Error("Sócio vinculado ao acesso não foi encontrado.");

  const closings = (closingsResult.data ?? []) as LooseRow[];
  const closingIds = closings.map((closing) => String(closing.id));
  let ownDistributions: LooseRow[] = [];
  if (closingIds.length) {
    const result = await supabase
      .from("closing_distributions")
      .select("closing_id,participation_percentage_snapshot,amount_cents,payment_status")
      .eq("partner_id", partnerId)
      .in("closing_id", closingIds);
    if (result.error) throw result.error;
    ownDistributions = (result.data ?? []) as LooseRow[];
  }

  const closingById = new Map(closings.map((closing) => [String(closing.id), closing]));
  const authorizedProjectIds = new Set(
    ((ownParticipationsResult.data ?? []) as LooseRow[]).map((row) => String(row.project_id)),
  );
  for (const distribution of ownDistributions) {
    const closing = closingById.get(String(distribution.closing_id));
    if (closing?.project_id) authorizedProjectIds.add(String(closing.project_id));
  }

  const projectIds = [...authorizedProjectIds].filter(Boolean);
  if (!projectIds.length) {
    return {
      month,
      generatedAt: new Date().toISOString(),
      partnerName: String(partnerResult.data.name),
      projects: [],
    };
  }

  const [projectsResult, financialsResult, participationsResult] = await Promise.all([
    supabase.from("projects").select("id,name,project_type,status").in("id", projectIds).order("name"),
    supabase
      .from("v_project_monthly_financials")
      .select("*")
      .eq("competence_month", competence)
      .in("project_id", projectIds),
    supabase
      .from("project_partners")
      .select("project_id,partner_id,participation_percentage")
      .in("project_id", projectIds)
      .eq("active", true)
      .lte("start_date", competence)
      .or(`end_date.is.null,end_date.gte.${competence}`),
  ]);

  for (const result of [projectsResult, financialsResult, participationsResult]) {
    if (result.error) throw result.error;
  }

  const closingByProject = new Map(closings.map((closing) => [String(closing.project_id), closing]));
  const openProjectIds = projectIds.filter((projectId) => !closingByProject.has(projectId));
  const authorizedClosingIds = closings
    .filter((closing) => authorizedProjectIds.has(String(closing.project_id)))
    .map((closing) => String(closing.id));

  let snapshotMovementRows: LooseRow[] = [];
  let directMovementRows: LooseRow[] = [];
  let sharedTransactionRows: LooseRow[] = [];

  const movementQueries: Promise<void>[] = [];
  if (authorizedClosingIds.length) {
    movementQueries.push((async () => {
      const result = await supabase
        .from("closing_movements")
        .select("id,closing_id,transaction_date,description,movement_kind,category_name_snapshot,status_snapshot,project_amount_cents,included_in_result")
        .in("closing_id", authorizedClosingIds);
      if (result.error) throw result.error;
      snapshotMovementRows = (result.data ?? []) as LooseRow[];
    })());
  }
  if (openProjectIds.length) {
    movementQueries.push((async () => {
      const result = await supabase
        .from("financial_transactions")
        .select("id,project_id,transaction_date,transaction_type,category_id,description,gross_amount_cents,fee_amount_cents,status,cost_scope,customer_payment_status")
        .in("project_id", openProjectIds)
        .eq("competence_month", competence)
        .eq("archived", false)
        .neq("status", "cancelled");
      if (result.error) throw result.error;
      directMovementRows = ((result.data ?? []) as LooseRow[]).filter((row) => (
        String(row.transaction_type) === "revenue"
        || (String(row.transaction_type) === "cost" && String(row.cost_scope) === "direct")
      ));
    })());
    movementQueries.push((async () => {
      const result = await supabase
        .from("financial_transactions")
        .select("id,transaction_date,category_id,description,status")
        .eq("competence_month", competence)
        .eq("transaction_type", "cost")
        .eq("cost_scope", "shared")
        .eq("archived", false)
        .neq("status", "cancelled");
      if (result.error) throw result.error;
      sharedTransactionRows = (result.data ?? []) as LooseRow[];
    })());
  }
  await Promise.all(movementQueries);

  const sharedTransactionIds = sharedTransactionRows.map((row) => String(row.id)).filter(Boolean);
  const categoryIds = [...new Set(
    [...directMovementRows, ...sharedTransactionRows].map((row) => String(row.category_id || "")).filter(Boolean),
  )];
  let allocationRows: LooseRow[] = [];
  let categoryRows: LooseRow[] = [];
  const detailQueries: Promise<void>[] = [];
  if (sharedTransactionIds.length) {
    detailQueries.push((async () => {
      const result = await supabase
        .from("shared_cost_allocations")
        .select("id,transaction_id,project_id,allocated_amount_cents")
        .in("transaction_id", sharedTransactionIds)
        .in("project_id", openProjectIds);
      if (result.error) throw result.error;
      allocationRows = (result.data ?? []) as LooseRow[];
    })());
  }
  if (categoryIds.length) {
    detailQueries.push((async () => {
      const result = await supabase.from("financial_categories").select("id,name").in("id", categoryIds);
      if (result.error) throw result.error;
      categoryRows = (result.data ?? []) as LooseRow[];
    })());
  }
  await Promise.all(detailQueries);

  const categoriesById = new Map(categoryRows.map((row) => [String(row.id), String(row.name)]));
  const movementsByProject = new Map<string, PartnerReportMovement[]>();
  for (const row of directMovementRows) {
    const projectId = String(row.project_id);
    const revenue = String(row.transaction_type) === "revenue";
    const includedInResult = revenue
      ? String(row.status) === "received" || String(row.customer_payment_status) === "paid"
      : String(row.status) === "paid";
    addMovement(movementsByProject, projectId, {
      id: `transaction:${String(row.id)}`,
      date: String(row.transaction_date),
      description: String(row.description || "Movimentação"),
      kind: revenue ? "revenue" : "direct_cost",
      categoryName: categoriesById.get(String(row.category_id)) ?? null,
      status: movementStatus(row),
      projectAmountCents: revenue
        ? numberValue(row.gross_amount_cents) - numberValue(row.fee_amount_cents)
        : -1 * (numberValue(row.gross_amount_cents) + numberValue(row.fee_amount_cents)),
      includedInResult,
    });
  }

  const sharedTransactionsById = new Map(sharedTransactionRows.map((row) => [String(row.id), row]));
  for (const allocation of allocationRows) {
    const transaction = sharedTransactionsById.get(String(allocation.transaction_id));
    if (!transaction) continue;
    addMovement(movementsByProject, String(allocation.project_id), {
      id: `allocation:${String(allocation.id)}`,
      date: String(transaction.transaction_date),
      description: String(transaction.description || "Custo compartilhado"),
      kind: "shared_cost",
      categoryName: categoriesById.get(String(transaction.category_id)) ?? null,
      status: String(transaction.status || "planned"),
      projectAmountCents: -1 * numberValue(allocation.allocated_amount_cents),
      includedInResult: String(transaction.status) === "paid",
    });
  }

  const snapshotMovementsByClosing = new Map<string, PartnerReportMovement[]>();
  for (const row of snapshotMovementRows) {
    const closingId = String(row.closing_id);
    const movement: PartnerReportMovement = {
      id: String(row.id),
      date: String(row.transaction_date),
      description: String(row.description || "Movimentação"),
      kind: String(row.movement_kind) as PartnerReportMovement["kind"],
      categoryName: row.category_name_snapshot ? String(row.category_name_snapshot) : null,
      status: String(row.status_snapshot || "planned"),
      projectAmountCents: numberValue(row.project_amount_cents),
      includedInResult: Boolean(row.included_in_result),
    };
    const current = snapshotMovementsByClosing.get(closingId) ?? [];
    current.push(movement);
    snapshotMovementsByClosing.set(closingId, current);
  }

  const financialByProject = new Map(
    ((financialsResult.data ?? []) as LooseRow[]).map((row) => [String(row.project_id), row]),
  );
  const participationsByProject = new Map<string, LooseRow[]>();
  addRowsByKey(participationsByProject, (participationsResult.data ?? []) as LooseRow[], "project_id");
  const distributionsByClosing = new Map<string, LooseRow[]>();
  addRowsByKey(distributionsByClosing, ownDistributions, "closing_id");

  const projects = ((projectsResult.data ?? []) as LooseRow[]).map<PartnerReportProject>((project) => {
    const projectId = String(project.id);
    const closing = closingByProject.get(projectId);
    const financial = closing ?? financialByProject.get(projectId) ?? {};
    const participations = participationsByProject.get(projectId) ?? [];
    const ownParticipations = participations.filter((row) => String(row.partner_id) === partnerId);
    const closingDistributions = closing
      ? distributionsByClosing.get(String(closing.id)) ?? []
      : [];
    const participationPercentage = closingDistributions.length
      ? sum(closingDistributions, "participation_percentage_snapshot")
      : sum(ownParticipations, "participation_percentage");
    const compositionTotal = sum(participations, "participation_percentage");
    const compositionValid = Boolean(closing) || Math.abs(compositionTotal - 100) <= COMPOSITION_TOLERANCE;
    const profitCents = numberValue(financial.profit_cents);

    const { partnerShareCents, shareKind } = calculatePartnerShare({
      closed: Boolean(closing),
      profitCents,
      participationPercentage,
      compositionValid,
      confirmedAmountCents: sum(closingDistributions, "amount_cents"),
    });

    return {
      id: projectId,
      name: String(project.name || "Projeto"),
      projectType: String(project.project_type || "client"),
      closed: Boolean(closing),
      closedAt: closing?.closed_at ? String(closing.closed_at) : null,
      participationPercentage,
      compositionValid,
      revenueGrossCents: numberValue(financial.revenue_gross_cents),
      revenueFeesCents: numberValue(financial.revenue_fees_cents),
      revenueNetCents: numberValue(financial.revenue_net_cents),
      directCostsCents: numberValue(financial.direct_costs_cents),
      sharedCostsCents: numberValue(financial.shared_costs_cents),
      profitCents,
      marginPercentage: nullableNumber(financial.margin_percentage),
      partnerShareCents,
      shareKind,
      paymentStatus: closing ? resolvePaymentStatus(closingDistributions) : null,
      movements: sortMovements(closing
        ? snapshotMovementsByClosing.get(String(closing.id)) ?? []
        : movementsByProject.get(projectId) ?? []),
    };
  });

  return {
    month,
    generatedAt: new Date().toISOString(),
    partnerName: String(partnerResult.data.name),
    projects,
  };
}
