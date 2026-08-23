import "server-only";
import { currentCompetence } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  FinancialProjectComparisonData,
  ProjectFinancialSummary,
  ProjectType,
} from "@/lib/types";

interface FinancialSnapshot {
  project_id: string;
  competence_month: string;
  revenue_gross_cents: number;
  revenue_fees_cents: number;
  revenue_net_cents: number;
  direct_costs_cents: number;
  shared_costs_cents: number;
  profit_cents: number;
  closing_id: string | null;
}

function snapshotKey(projectId: string, competenceMonth: string) {
  return `${projectId}:${competenceMonth}`;
}

export async function getFullCycleProjectComparison(): Promise<FinancialProjectComparisonData> {
  const supabase = getSupabaseAdmin();
  const endMonth = currentCompetence();

  const [projectsResult, financialsResult, closingsResult, distributionsResult, participationsResult, partnersResult] = await Promise.all([
    supabase.from("projects").select("id,name,project_type,status").neq("status", "archived").order("name"),
    supabase.from("v_project_monthly_financials").select("*").lte("competence_month", endMonth),
    supabase.from("monthly_closings").select("*").eq("status", "closed").lte("competence_month", endMonth),
    supabase.from("closing_distributions").select("closing_id,partner_type_snapshot,amount_cents"),
    supabase.from("project_partners").select("project_id,partner_id,participation_percentage,start_date,end_date,active").eq("active", true),
    supabase.from("partners").select("id,partner_type"),
  ]);

  for (const result of [projectsResult, financialsResult, closingsResult, distributionsResult, participationsResult, partnersResult]) {
    if (result.error) throw result.error;
  }

  const snapshots = new Map<string, FinancialSnapshot>();
  for (const row of financialsResult.data ?? []) {
    snapshots.set(snapshotKey(row.project_id, row.competence_month), {
      project_id: row.project_id,
      competence_month: row.competence_month,
      revenue_gross_cents: Number(row.revenue_gross_cents ?? 0),
      revenue_fees_cents: Number(row.revenue_fees_cents ?? 0),
      revenue_net_cents: Number(row.revenue_net_cents ?? 0),
      direct_costs_cents: Number(row.direct_costs_cents ?? 0),
      shared_costs_cents: Number(row.shared_costs_cents ?? 0),
      profit_cents: Number(row.profit_cents ?? 0),
      closing_id: null,
    });
  }

  // A snapshot fechada prevalece sobre dados vivos da mesma competência.
  for (const closing of closingsResult.data ?? []) {
    snapshots.set(snapshotKey(closing.project_id, closing.competence_month), {
      project_id: closing.project_id,
      competence_month: closing.competence_month,
      revenue_gross_cents: Number(closing.revenue_gross_cents ?? 0),
      revenue_fees_cents: Number(closing.revenue_fees_cents ?? 0),
      revenue_net_cents: Number(closing.revenue_net_cents ?? 0),
      direct_costs_cents: Number(closing.direct_costs_cents ?? 0),
      shared_costs_cents: Number(closing.shared_costs_cents ?? 0),
      profit_cents: Number(closing.profit_cents ?? 0),
      closing_id: closing.id,
    });
  }

  const distributionsByClosing = new Map<string, Array<{ partner_type_snapshot: string; amount_cents: number }>>();
  for (const distribution of distributionsResult.data ?? []) {
    const rows = distributionsByClosing.get(distribution.closing_id) ?? [];
    rows.push({
      partner_type_snapshot: distribution.partner_type_snapshot,
      amount_cents: Number(distribution.amount_cents ?? 0),
    });
    distributionsByClosing.set(distribution.closing_id, rows);
  }

  const partnerTypeById = new Map((partnersResult.data ?? []).map((partner) => [partner.id, partner.partner_type]));
  const participations = participationsResult.data ?? [];
  const snapshotRows = [...snapshots.values()];

  const projectSummaries: ProjectFinancialSummary[] = (projectsResult.data ?? []).map((project) => {
    const projectSnapshots = snapshotRows.filter((snapshot) => snapshot.project_id === project.id);
    let revenueGross = 0;
    let revenueFees = 0;
    let revenueNet = 0;
    let directCosts = 0;
    let sharedCosts = 0;
    let profit = 0;
    let prodexyShare = 0;
    let externalShare = 0;
    let participationValid = true;

    for (const snapshot of projectSnapshots) {
      revenueGross += snapshot.revenue_gross_cents;
      revenueFees += snapshot.revenue_fees_cents;
      revenueNet += snapshot.revenue_net_cents;
      directCosts += snapshot.direct_costs_cents;
      sharedCosts += snapshot.shared_costs_cents;
      profit += snapshot.profit_cents;

      if (snapshot.profit_cents <= 0) {
        prodexyShare += snapshot.profit_cents;
        continue;
      }

      if (snapshot.closing_id) {
        const distributions = distributionsByClosing.get(snapshot.closing_id) ?? [];
        if (!distributions.length) participationValid = false;
        prodexyShare += distributions
          .filter((distribution) => distribution.partner_type_snapshot === "holding")
          .reduce((sum, distribution) => sum + distribution.amount_cents, 0);
        externalShare += distributions
          .filter((distribution) => distribution.partner_type_snapshot === "external")
          .reduce((sum, distribution) => sum + distribution.amount_cents, 0);
        continue;
      }

      const activeParticipations = participations.filter((participation) => (
        participation.project_id === project.id
        && participation.start_date <= snapshot.competence_month
        && (!participation.end_date || participation.end_date >= snapshot.competence_month)
      ));

      if (!activeParticipations.length) {
        prodexyShare += snapshot.profit_cents;
        continue;
      }

      const percentageSum = activeParticipations.reduce(
        (sum, participation) => sum + Number(participation.participation_percentage || 0),
        0,
      );
      if (Math.abs(percentageSum - 100) > 0.0001) participationValid = false;

      const shares = activeParticipations.map((participation) => ({
        type: partnerTypeById.get(participation.partner_id),
        amount: Math.round(snapshot.profit_cents * Number(participation.participation_percentage || 0) / 100),
      }));
      const roundingDifference = snapshot.profit_cents - shares.reduce((sum, share) => sum + share.amount, 0);
      const adjustmentIndex = Math.max(0, shares.findIndex((share) => share.type === "holding"));
      if (shares.length && Math.abs(percentageSum - 100) <= 0.0001) shares[adjustmentIndex].amount += roundingDifference;

      prodexyShare += shares.filter((share) => share.type === "holding").reduce((sum, share) => sum + share.amount, 0);
      externalShare += shares.filter((share) => share.type !== "holding").reduce((sum, share) => sum + share.amount, 0);
    }

    return {
      project_id: project.id,
      project_name: project.name,
      project_type: project.project_type as ProjectType,
      revenue_gross_cents: revenueGross,
      revenue_fees_cents: revenueFees,
      revenue_net_cents: revenueNet,
      direct_costs_cents: directCosts,
      shared_costs_cents: sharedCosts,
      profit_cents: profit,
      margin_percentage: revenueGross ? profit / revenueGross * 100 : null,
      prodexy_share_cents: prodexyShare,
      external_share_cents: externalShare,
      participation_valid: participationValid,
    };
  });

  const months = snapshotRows.map((snapshot) => snapshot.competence_month).sort();
  return {
    period: "full_cycle",
    start_month: months[0] ?? null,
    end_month: endMonth,
    project_summaries: projectSummaries,
  };
}
