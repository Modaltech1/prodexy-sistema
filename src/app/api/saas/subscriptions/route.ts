import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayInSaoPaulo } from "@/lib/date";

type SubscriptionInput = {
  id?: string;
  project_id?: string;
  client_id?: string;
  plan_id?: string | null;
  monthly_amount_cents?: number;
  billing_day?: number;
  fee_profile_id?: string | null;
  payout_day?: number;
  payout_month_offset?: number;
  automatic_billing?: boolean;
  automatic_billing_start_month?: string;
  status?: string;
};

function validateDay(value: number | undefined, label: string) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 31) {
    throw new Error(`${label} deve estar entre 1 e 31.`);
  }
}

function subscriptionPayload(body: SubscriptionInput) {
  const amount = Math.round(Number(body.monthly_amount_cents));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor bruto mensal maior que zero.");
  validateDay(body.billing_day, "O dia de cobrança");
  validateDay(body.payout_day, "O dia de repasse");
  const offset = Number(body.payout_month_offset ?? 1);
  if (!Number.isInteger(offset) || offset < 0 || offset > 3) throw new Error("O intervalo do repasse é inválido.");
  const startMonth = `${String(body.automatic_billing_start_month || "").slice(0, 7)}-01`;
  if (!/^\d{4}-\d{2}-01$/.test(startMonth)) throw new Error("Informe o primeiro mês da automação.");
  const status = body.status || "active";
  if (!["active", "trial", "overdue", "cancelled"].includes(status)) throw new Error("Status de assinatura inválido.");

  return {
    plan_id: body.plan_id || null,
    monthly_amount_cents: amount,
    billing_day: body.billing_day,
    fee_profile_id: body.fee_profile_id || null,
    payout_day: body.payout_day,
    payout_month_offset: offset,
    automatic_billing: Boolean(body.automatic_billing),
    automatic_billing_start_month: startMonth,
    status,
  };
}

async function assertSaasProject(projectId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("projects").select("project_type,status").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data || data.project_type !== "saas" || data.status === "archived") throw new Error("A assinatura exige um projeto SaaS ativo.");
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<SubscriptionInput>(request);
    const projectId = body.project_id?.trim();
    const clientId = body.client_id?.trim();
    if (!projectId || !clientId) return badRequest("Projeto e cliente são obrigatórios.");
    await assertSaasProject(projectId);
    const payload = subscriptionPayload(body);
    const supabase = getSupabaseAdmin();

    const { data: duplicate, error: duplicateError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("project_id", projectId)
      .eq("client_id", clientId)
      .in("status", ["active", "trial", "overdue"])
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return badRequest("Este cliente já possui uma assinatura ativa no projeto.");

    const { data, error } = await supabase
      .from("subscriptions")
      .insert({ ...payload, project_id: projectId, client_id: clientId, start_date: `${payload.automatic_billing_start_month.slice(0, 7)}-01` })
      .select("*")
      .single();
    if (error) throw error;

    const { data: relation, error: relationError } = await supabase
      .from("project_clients")
      .select("id")
      .eq("project_id", projectId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (relationError) {
      await supabase.from("subscriptions").delete().eq("id", data.id);
      throw relationError;
    }
    if (relation) {
      const { error } = await supabase.from("project_clients").update({ relationship_type: "subscriber", active: true }).eq("id", relation.id);
      if (error) {
        await supabase.from("subscriptions").delete().eq("id", data.id);
        throw error;
      }
    } else {
      const { error } = await supabase.from("project_clients").insert({ project_id: projectId, client_id: clientId, relationship_type: "subscriber", active: true });
      if (error) {
        await supabase.from("subscriptions").delete().eq("id", data.id);
        throw error;
      }
    }
    return ok(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /^(Informe|O |Status|A assinatura)/.test(error.message)) return badRequest(error.message);
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<SubscriptionInput>(request);
    const id = body.id?.trim();
    if (!id) return badRequest("Assinatura obrigatória.");
    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase.from("subscriptions").select("project_id").eq("id", id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return badRequest("Assinatura não encontrada.");
    await assertSaasProject(existing.project_id);
    const payload = subscriptionPayload(body);
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ ...payload, cancellation_date: payload.status === "cancelled" ? todayInSaoPaulo() : null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return ok(data);
  } catch (error) {
    if (error instanceof Error && /^(Informe|O |Status|A assinatura)/.test(error.message)) return badRequest(error.message);
    return serverError(error);
  }
}
