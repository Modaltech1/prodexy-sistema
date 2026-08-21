import { NextRequest } from "next/server";
import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/access";

interface RecurringAllocationInput {
  project_id: string;
  percentage: number;
}

interface RecurringFinancialInput {
  name?: string;
  project_id?: string | null;
  client_id?: string | null;
  transaction_type?: string;
  category_id?: string | null;
  description?: string;
  quantity?: number | string;
  unit_amount_cents?: number | string;
  fee_profile_id?: string | null;
  cost_scope?: string;
  frequency?: string;
  interval_count?: number | string;
  next_due_date?: string | null;
  notes?: string | null;
  allocations?: RecurringAllocationInput[];
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await readJson<RecurringFinancialInput>(request);
    const supabase = getSupabaseAdmin();

    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const transactionType = String(body.transaction_type || "cost");
    const costScope = transactionType === "revenue" ? (body.project_id ? "direct" : "holding") : String(body.cost_scope || (body.project_id ? "direct" : "holding"));
    const frequency = String(body.frequency || "monthly");
    const intervalCount = Math.max(1, Number(body.interval_count || 1));
    const unitAmountCents = Math.max(0, Math.round(Number(body.unit_amount_cents || 0)));
    const quantity = Math.max(0, Number(body.quantity || 1));

    if (!name) return badRequest("Nome obrigatório.");
    if (!description) return badRequest("Descrição obrigatória.");
    if (!unitAmountCents) return badRequest("Valor unitário obrigatório.");
    if (!["revenue", "cost"].includes(transactionType)) return badRequest("Tipo financeiro inválido.");
    if (!["monthly", "annual", "weekly", "custom"].includes(frequency)) return badRequest("Frequência inválida.");
    if (transactionType === "cost" && !["direct", "shared", "holding"].includes(costScope)) return badRequest("Escopo de custo inválido.");
    if (costScope === "direct" && transactionType === "cost" && !body.project_id) return badRequest("Custo direto precisa de projeto.");
    if (costScope === "holding" && body.project_id) return badRequest("Custo da holding não deve apontar para um projeto.");

    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (transactionType === "cost" && costScope === "shared") {
      if (!allocations.length) return badRequest("Selecione os projetos do rateio recorrente.");
      const sum = allocations.reduce((total, allocation) => total + Number(allocation.percentage || 0), 0);
      if (sum <= 0 || sum > 100.0001) {
        return badRequest(`O percentual destinado aos projetos deve ser maior que 0% e no máximo 100%. Atual: ${sum.toFixed(4)}%.`);
      }
    }

    const { data: template, error } = await supabase
      .from("recurring_financial_templates")
      .insert({
        name,
        project_id: costScope === "shared" ? null : body.project_id || null,
        client_id: body.client_id || null,
        transaction_type: transactionType,
        category_id: body.category_id || null,
        description,
        quantity,
        unit_amount_cents: unitAmountCents,
        fee_profile_id: body.fee_profile_id || null,
        cost_scope: costScope,
        frequency,
        interval_count: intervalCount,
        next_due_date: body.next_due_date || null,
        active: true,
        notes: body.notes || null,
      })
      .select("*")
      .single();
    if (error) throw error;

    try {
      if (transactionType === "cost" && costScope === "shared") {
        const payload = allocations.map((allocation) => ({
          template_id: template.id,
          project_id: allocation.project_id,
          allocation_percentage: Number(allocation.percentage),
        }));
        const { error: allocationError } = await supabase.from("recurring_financial_allocations").insert(payload);
        if (allocationError) throw allocationError;
      }
    } catch (allocationError) {
      await supabase.from("recurring_financial_templates").delete().eq("id", template.id);
      throw allocationError;
    }

    return ok(template, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
