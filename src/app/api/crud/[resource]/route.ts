import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { calculateFee } from "@/lib/finance";
import { todayInSaoPaulo } from "@/lib/date";

const resources = {
  projects: { table: "projects", order: "name" },
  clients: { table: "clients", order: "name" },
  "project-clients": { table: "project_clients", order: "created_at" },
  plans: { table: "plans", order: "name" },
  subscriptions: { table: "subscriptions", order: "created_at" },
  categories: { table: "financial_categories", order: "name" },
  "fee-profiles": { table: "fee_profiles", order: "name" },
  transactions: { table: "financial_transactions", order: "transaction_date", desc: true },
  allocations: { table: "shared_cost_allocations", order: "created_at" },
  partners: { table: "partners", order: "name" },
  "project-partners": { table: "project_partners", order: "start_date", desc: true },
  goals: { table: "goals", order: "competence_month", desc: true },
  "task-categories": { table: "task_categories", order: "name" },
  tasks: { table: "tasks", order: "created_at", desc: true },
  "time-entries": { table: "task_time_entries", order: "started_at", desc: true },
  "work-sessions": { table: "work_sessions", order: "session_date", desc: true },
  "work-session-items": { table: "work_session_items", order: "position" },
  leads: { table: "leads", order: "updated_at", desc: true },
  "lead-activities": { table: "lead_activities", order: "happened_at", desc: true },
  "recurring-tasks": { table: "recurring_task_templates", order: "created_at", desc: true },
  "recurring-financials": { table: "recurring_financial_templates", order: "created_at", desc: true },
  "recurring-financial-allocations": { table: "recurring_financial_allocations", order: "created_at" },
  closings: { table: "monthly_closings", order: "competence_month", desc: true },
  distributions: { table: "closing_distributions", order: "created_at", desc: true },
} as const;

type ResourceName = keyof typeof resources;

const allowedFilters = new Set([
  "id", "project_id", "client_id", "status", "competence_month", "scope_type",
  "transaction_type", "cost_scope", "category_id", "partner_id", "closing_id",
  "active", "stage", "temperature", "interest_project_id", "task_id",
  "work_session_id", "relationship_type", "plan_id", "partner_type", "template_id",
]);

function resourceConfig(name: string) {
  return resources[name as ResourceName];
}

async function normalizeTransaction(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const quantity = Number(body.quantity ?? 1) || 0;
  const unit = Number(body.unit_amount_cents ?? 0) || 0;
  const gross = body.gross_amount_cents === undefined || body.gross_amount_cents === null
    ? Math.round(quantity * unit)
    : Number(body.gross_amount_cents);

  let fee = body.fee_amount_cents === undefined || body.fee_amount_cents === null
    ? 0
    : Number(body.fee_amount_cents);

  if (body.fee_profile_id && body.fee_amount_cents === undefined) {
    const { data: profile } = await supabase
      .from("fee_profiles")
      .select("percentage,fixed_amount_cents")
      .eq("id", String(body.fee_profile_id))
      .maybeSingle();
    if (profile) fee = calculateFee(gross, Number(profile.percentage), Number(profile.fixed_amount_cents));
  }

  const transactionType = String(body.transaction_type ?? "revenue");
  const status = String(body.status ?? "planned");
  const realized = (transactionType === "revenue" && status === "received") || (transactionType === "cost" && status === "paid");
  const projectId = body.project_id ? String(body.project_id) : null;

  return {
    ...body,
    project_id: projectId,
    client_id: body.client_id || null,
    category_id: body.category_id || null,
    fee_profile_id: body.fee_profile_id || null,
    quantity,
    unit_amount_cents: unit,
    gross_amount_cents: gross,
    fee_amount_cents: Math.max(0, fee),
    competence_month: String(body.competence_month).slice(0, 7) + "-01",
    cost_scope: transactionType === "revenue" ? (projectId ? "direct" : "holding") : String(body.cost_scope ?? (projectId ? "direct" : "holding")),
    realized_at: realized ? (body.realized_at || body.transaction_date || new Date().toISOString().slice(0, 10)) : null,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await context.params;
    const config = resourceConfig(resource);
    if (!config) return badRequest("Recurso inválido.");

    const supabase = getSupabaseAdmin();
    let query = supabase.from(config.table).select("*");

    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      if (!allowedFilters.has(key) || value === "" || value === "all") continue;
      if (key === "active") query = query.eq(key, value === "true");
      else query = query.eq(key, value);
    }

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 500), 2000);
    query = query.order(config.order, { ascending: !("desc" in config && config.desc) }).limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return ok(data ?? []);
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await context.params;
    const config = resourceConfig(resource);
    if (!config) return badRequest("Recurso inválido.");

    let body = await readJson<Record<string, unknown>>(request);
    if (resource === "transactions") body = await normalizeTransaction(body);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from(config.table).insert(body).select("*").single();
    if (error) throw error;
    return ok(data, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await context.params;
    const config = resourceConfig(resource);
    if (!config) return badRequest("Recurso inválido.");

    const raw = await readJson<Record<string, unknown>>(request);
    const id = String(raw.id || "");
    if (!id) return badRequest("ID obrigatório.");
    const { id: _id, ...updatesRaw } = raw;
    const supabase = getSupabaseAdmin();
    let updates: Record<string, unknown> = updatesRaw;

    if (resource === "transactions") {
      // PATCH pode trazer apenas parte dos campos. Recalcule usando o registro
      // completo para não substituir competência/tipo/valores por defaults.
      const { data: existing, error: existingError } = await supabase
        .from(config.table)
        .select("*")
        .eq("id", id)
        .single();
      if (existingError) throw existingError;

      const merged = { ...existing, ...updatesRaw };
      const nextType = String(merged.transaction_type || "revenue");
      const nextStatus = String(merged.status || "planned");
      const wasRealized = (existing.transaction_type === "revenue" && existing.status === "received") || (existing.transaction_type === "cost" && existing.status === "paid");
      const becomesRealized = (nextType === "revenue" && nextStatus === "received") || (nextType === "cost" && nextStatus === "paid");
      if (!wasRealized && becomesRealized && updatesRaw.realized_at === undefined) merged.realized_at = todayInSaoPaulo();
      if (wasRealized && !becomesRealized && updatesRaw.realized_at === undefined) merged.realized_at = null;
      const { id: _existingId, created_at: _createdAt, updated_at: _updatedAt, net_amount_cents: _net, ...normalizable } = merged;
      updates = await normalizeTransaction(normalizable);
    }

    const { data, error } = await supabase.from(config.table).update(updates).eq("id", id).select("*").single();
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await context.params;
    const config = resourceConfig(resource);
    if (!config) return badRequest("Recurso inválido.");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return badRequest("ID obrigatório.");

    const supabase = getSupabaseAdmin();
    if (resource === "projects") {
      const { error } = await supabase.from(config.table).update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    } else if (resource === "tasks" || resource === "transactions") {
      const { error } = await supabase.from(config.table).update({ archived: true }).eq("id", id);
      if (error) throw error;
    } else if (["plans", "partners", "categories", "fee-profiles", "recurring-tasks", "recurring-financials"].includes(resource)) {
      const { error } = await supabase.from(config.table).update({ active: false }).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from(config.table).delete().eq("id", id);
      if (error) throw error;
    }
    return ok({ id });
  } catch (error) {
    return serverError(error);
  }
}
