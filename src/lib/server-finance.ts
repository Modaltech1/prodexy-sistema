import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProjectFinancialSummary } from "@/lib/types";
import { competenceRange, currentCompetence } from "@/lib/date";
import { isRevenueRecognized } from "@/lib/finance";

export function normalizeMonth(month?: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return currentCompetence().slice(0, 7);
  return month;
}

export function normalizeFinancialBasis(basis?: string | null): "competence" | "cash" {
  return basis === "cash" ? "cash" : "competence";
}

export async function getFinancialDashboard(monthParam?: string | null, basisParam?: string | null) {
  const supabase = getSupabaseAdmin();
  const month = normalizeMonth(monthParam);
  const basis = normalizeFinancialBasis(basisParam);
  const competence = `${month}-01`;
  const range = competenceRange(month);

  let transactionQuery = supabase
    .from("financial_transactions")
    .select("*")
    .eq("archived", false)
    .neq("status", "cancelled");

  if (basis === "cash") transactionQuery = transactionQuery.gte("realized_at", range.start).lt("realized_at", range.endExclusive);
  else transactionQuery = transactionQuery.eq("competence_month", competence);

  const [projectsRes, projectFinancialsRes, transactionsRes, partnersRes, projectPartnersRes, closingsRes, distributionsRes, allocationsRes] = await Promise.all([
    supabase.from("projects").select("id,name,project_type,status").neq("status", "archived").order("name"),
    supabase.from("v_project_monthly_financials").select("*").eq("competence_month", competence),
    transactionQuery,
    supabase.from("partners").select("id,name,partner_type,active"),
    supabase.from("project_partners").select("*").eq("active", true).lte("start_date", competence),
    supabase.from("monthly_closings").select("*").eq("competence_month", competence).eq("status", "closed"),
    supabase.from("closing_distributions").select("*"),
    supabase.from("shared_cost_allocations").select("transaction_id,allocated_amount_cents,project_id"),
  ]);

  for (const result of [projectsRes, projectFinancialsRes, transactionsRes, partnersRes, projectPartnersRes, closingsRes, distributionsRes, allocationsRes]) {
    if (result.error) throw result.error;
  }

  const projects = projectsRes.data ?? [];
  const financialViewRows = projectFinancialsRes.data ?? [];
  const transactions = transactionsRes.data ?? [];
  const partners = partnersRes.data ?? [];
  const projectPartners = (projectPartnersRes.data ?? []).filter((row) => !row.end_date || row.end_date >= competence);
  const closings = closingsRes.data ?? [];
  const distributions = distributionsRes.data ?? [];
  const allocations = allocationsRes.data ?? [];

  const closingByProject = new Map(closings.map((closing) => [closing.project_id, closing]));
  const distributionsByClosing = new Map<string, typeof distributions>();
  for (const distribution of distributions) {
    const rows = distributionsByClosing.get(distribution.closing_id) ?? [];
    rows.push(distribution);
    distributionsByClosing.set(distribution.closing_id, rows);
  }

  const realizedRevenue = transactions.filter((transaction) => isRevenueRecognized(transaction, basis));
  const realizedCosts = transactions.filter((transaction) => transaction.transaction_type === "cost" && transaction.status === "paid");
  const selectedSharedTransactions = realizedCosts.filter((transaction) => transaction.cost_scope === "shared");
  const selectedSharedIds = new Set(selectedSharedTransactions.map((transaction) => transaction.id));

  const summaries: ProjectFinancialSummary[] = projects.map((project) => {
    let base: Omit<ProjectFinancialSummary, "prodexy_share_cents" | "external_share_cents" | "participation_sum_percentage" | "participation_valid">;

    if (basis === "competence") {
      const row = financialViewRows.find((item) => item.project_id === project.id);
      base = {
        project_id: project.id,
        project_name: project.name,
        project_type: project.project_type,
        revenue_gross_cents: Number(row?.revenue_gross_cents ?? 0),
        revenue_fees_cents: Number(row?.revenue_fees_cents ?? 0),
        revenue_net_cents: Number(row?.revenue_net_cents ?? 0),
        direct_costs_cents: Number(row?.direct_costs_cents ?? 0),
        shared_costs_cents: Number(row?.shared_costs_cents ?? 0),
        profit_cents: Number(row?.profit_cents ?? 0),
        margin_percentage: row?.margin_percentage === null || row?.margin_percentage === undefined ? null : Number(row.margin_percentage),
      };
    } else {
      const projectRevenue = realizedRevenue.filter((transaction) => transaction.project_id === project.id);
      const revenueGross = projectRevenue.reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents), 0);
      const revenueFees = projectRevenue.reduce((sum, transaction) => sum + Number(transaction.fee_amount_cents), 0);
      const revenueNet = revenueGross - revenueFees;
      const directCosts = realizedCosts
        .filter((transaction) => transaction.project_id === project.id && transaction.cost_scope === "direct")
        .reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents) + Number(transaction.fee_amount_cents), 0);
      const sharedCosts = allocations
        .filter((allocation) => allocation.project_id === project.id && selectedSharedIds.has(allocation.transaction_id))
        .reduce((sum, allocation) => sum + Number(allocation.allocated_amount_cents), 0);
      const profit = revenueNet - directCosts - sharedCosts;
      base = {
        project_id: project.id,
        project_name: project.name,
        project_type: project.project_type,
        revenue_gross_cents: revenueGross,
        revenue_fees_cents: revenueFees,
        revenue_net_cents: revenueNet,
        direct_costs_cents: directCosts,
        shared_costs_cents: sharedCosts,
        profit_cents: profit,
        margin_percentage: revenueGross ? profit / revenueGross * 100 : null,
      };
    }

    const activeParticipations = projectPartners.filter((participation) => participation.project_id === project.id);
    const participationSum = activeParticipations.length
      ? activeParticipations.reduce((sum, participation) => sum + Number(participation.participation_percentage || 0), 0)
      : 100;
    const participationValid = Math.abs(participationSum - 100) <= 0.0001;

    // Prejuízo não gera distribuição positiva. Até existir uma regra explícita de
    // compartilhamento de prejuízo, ele permanece integralmente visível no resultado Prodexy.
    if (base.profit_cents <= 0) {
      return {
        ...base,
        prodexy_share_cents: base.profit_cents,
        external_share_cents: 0,
        participation_sum_percentage: participationSum,
        participation_valid: participationValid,
      };
    }

    // Snapshot fechado é usado somente na visão por competência. Caixa é uma
    // leitura gerencial de recebimentos/pagamentos e usa a participação vigente do mês.
    const closing = basis === "competence" ? closingByProject.get(project.id) : null;
    if (closing) {
      const closingDistributions = distributionsByClosing.get(closing.id) ?? [];
      const prodexy = closingDistributions.filter((distribution) => distribution.partner_type_snapshot === "holding").reduce((sum, distribution) => sum + Number(distribution.amount_cents), 0);
      const external = closingDistributions.filter((distribution) => distribution.partner_type_snapshot === "external").reduce((sum, distribution) => sum + Number(distribution.amount_cents), 0);
      return { ...base, prodexy_share_cents: prodexy, external_share_cents: external, participation_sum_percentage: 100, participation_valid: true };
    }

    if (!activeParticipations.length) {
      return { ...base, prodexy_share_cents: base.profit_cents, external_share_cents: 0, participation_sum_percentage: 100, participation_valid: true };
    }

    let prodexy = 0;
    let external = 0;
    for (const participation of activeParticipations) {
      const partner = partners.find((item) => item.id === participation.partner_id);
      const amount = Math.round(base.profit_cents * (Number(participation.participation_percentage) / 100));
      if (partner?.partner_type === "holding") prodexy += amount;
      else external += amount;
    }

    return {
      ...base,
      prodexy_share_cents: prodexy,
      external_share_cents: external,
      participation_sum_percentage: participationSum,
      participation_valid: participationValid,
    };
  });

  const revenueGross = realizedRevenue.reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents), 0);
  const revenueFees = realizedRevenue.reduce((sum, transaction) => sum + Number(transaction.fee_amount_cents), 0);
  const revenueNet = revenueGross - revenueFees;
  const totalCosts = realizedCosts.reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents) + Number(transaction.fee_amount_cents), 0);
  const holdingRevenueNet = realizedRevenue.filter((transaction) => !transaction.project_id).reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents) - Number(transaction.fee_amount_cents), 0);
  const holdingCosts = realizedCosts.filter((transaction) => transaction.cost_scope === "holding").reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents) + Number(transaction.fee_amount_cents), 0);

  const sharedOriginal = selectedSharedTransactions.reduce((sum, transaction) => sum + Number(transaction.gross_amount_cents) + Number(transaction.fee_amount_cents), 0);
  const sharedAllocated = allocations.filter((allocation) => selectedSharedIds.has(allocation.transaction_id)).reduce((sum, allocation) => sum + Number(allocation.allocated_amount_cents), 0);
  const unallocatedShared = sharedOriginal - sharedAllocated;

  const projectProfit = summaries.reduce((sum, project) => sum + project.profit_cents, 0);
  const externalShares = summaries.reduce((sum, project) => sum + Math.max(0, project.external_share_cents), 0);
  const prodexyProjectShares = summaries.reduce((sum, project) => sum + project.prodexy_share_cents, 0);
  // Custos compartilhados alocados já reduziram o lucro dos projetos. Apenas
  // diferença não rateada precisa reduzir novamente o resultado da holding.
  const prodexyResult = holdingRevenueNet - holdingCosts - unallocatedShared + prodexyProjectShares;

  const pendingDistributions = distributions
    .filter((distribution) => distribution.partner_type_snapshot === "external" && distribution.payment_status === "pending")
    .filter((distribution) => closings.some((closing) => closing.id === distribution.closing_id))
    .reduce((sum, distribution) => sum + Number(distribution.amount_cents), 0);

  return {
    month,
    competence,
    basis,
    revenue_gross_cents: revenueGross,
    revenue_fees_cents: revenueFees,
    revenue_net_cents: revenueNet,
    total_costs_cents: totalCosts,
    project_profit_cents: projectProfit,
    external_share_cents: externalShares,
    prodexy_result_cents: prodexyResult,
    pending_distributions_cents: pendingDistributions,
    holding_revenue_net_cents: holdingRevenueNet,
    holding_costs_cents: holdingCosts,
    shared_original_cents: sharedOriginal,
    shared_allocated_cents: sharedAllocated,
    shared_allocation_difference_cents: sharedOriginal - sharedAllocated,
    project_summaries: summaries,
  };
}
