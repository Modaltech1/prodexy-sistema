import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ok, serverError } from "@/lib/api";
import { normalizeMonth } from "@/lib/server-finance";
import { requireAdmin } from "@/lib/auth/access";
import { isRevenueRecognized } from "@/lib/finance";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getSupabaseAdmin();
    const month = normalizeMonth(request.nextUrl.searchParams.get("month"));
    const competence = `${month}-01`;
    const [goalsRes, projectsRes, clientsRelRes, subsRes, transactionsRes, categoriesRes] = await Promise.all([
      supabase.from("goals").select("*").eq("competence_month", competence),
      supabase.from("projects").select("id,name,project_type,status").neq("status","archived"),
      supabase.from("project_clients").select("project_id,client_id,active"),
      supabase.from("subscriptions").select("project_id,client_id,status,monthly_amount_cents"),
      supabase.from("financial_transactions").select("project_id,transaction_type,status,customer_payment_status,gross_amount_cents,fee_amount_cents,category_id").eq("competence_month", competence).eq("archived",false),
      supabase.from("financial_categories").select("id,goal_bucket"),
    ]);
    for (const r of [goalsRes, projectsRes, clientsRelRes, subsRes, transactionsRes, categoriesRes]) if (r.error) throw r.error;

    const projects = projectsRes.data ?? [];
    const relations = clientsRelRes.data ?? [];
    const subs = subsRes.data ?? [];
    const transactions = transactionsRes.data ?? [];
    const categoryMap = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.goal_bucket]));

    const rows = (goalsRes.data ?? []).map((goal) => {
      let projectIds: string[] = [];
      let label = "Prodexy Labs";
      if (goal.scope_type === "project") {
        projectIds = [goal.project_id];
        label = projects.find((p) => p.id === goal.project_id)?.name || "Projeto";
      } else if (goal.scope_type === "client_projects") {
        projectIds = projects.filter((p) => p.project_type === "client" && p.status === "active").map((p) => p.id);
        label = "Prodexy — projetos de cliente";
      } else {
        projectIds = projects.map((p) => p.id);
        label = "Prodexy Labs";
      }

      let actualClients = 0;
      if (goal.scope_type === "project") {
        const project = projects.find((p) => p.id === goal.project_id);
        actualClients = project?.project_type === "saas"
          ? new Set(subs.filter((s) => s.project_id === goal.project_id && ["active","trial","overdue"].includes(s.status)).map((s) => s.client_id)).size
          : new Set(relations.filter((r) => r.project_id === goal.project_id && r.active).map((r) => r.client_id)).size;
      } else if (goal.scope_type === "client_projects") {
        actualClients = new Set(relations.filter((r) => projectIds.includes(r.project_id) && r.active).map((r) => r.client_id)).size;
      } else {
        actualClients = new Set(relations.filter((r) => r.active).map((r) => r.client_id)).size;
      }

      const realizedRevenue = transactions.filter((t) => isRevenueRecognized(t, "competence") && (goal.scope_type === "holding" ? true : projectIds.includes(t.project_id)));
      let recurring = 0, setup = 0, total = 0;
      for (const t of realizedRevenue) {
        const net = Number(t.gross_amount_cents) - Number(t.fee_amount_cents);
        total += net;
        const bucket = categoryMap.get(t.category_id);
        if (bucket === "recurring") recurring += net;
        if (bucket === "implementation") setup += net;
      }
      return {
        ...goal, label,
        actual_clients: actualClients,
        actual_setup_revenue_cents: setup,
        actual_recurring_revenue_cents: recurring,
        actual_total_revenue_cents: total,
      };
    });

    return ok({ month, rows });
  } catch (error) {
    return serverError(error);
  }
}
