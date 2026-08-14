import "server-only";
import type {
  PartnerPaymentStatus,
  PartnerReportData,
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

  const financialByProject = new Map(
    ((financialsResult.data ?? []) as LooseRow[]).map((row) => [String(row.project_id), row]),
  );
  const closingByProject = new Map(closings.map((closing) => [String(closing.project_id), closing]));
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
    };
  });

  return {
    month,
    generatedAt: new Date().toISOString(),
    partnerName: String(partnerResult.data.name),
    projects,
  };
}
