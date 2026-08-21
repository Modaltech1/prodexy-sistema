import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/access";
import { validateSharedCostAllocations } from "@/lib/shared-costs";

interface AllocationInput {
  project_id: string;
  allocated_amount_cents: number;
  percentage?: number | null;
  allocation_method?: "equal" | "percentage" | "manual";
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let transactionId: string | null = null;
  try {
    await requireAdmin();
    const body = await readJson<Record<string, unknown> & { allocations?: AllocationInput[] }>(request);
    const allocations = body.allocations ?? [];
    if (!allocations.length) return badRequest("Selecione ao menos um projeto para o rateio.");

    const gross = Math.round(Number(body.gross_amount_cents ?? 0));
    const fee = Math.round(Number(body.fee_amount_cents ?? 0));
    const expected = gross + fee;
    const validation = validateSharedCostAllocations(expected, allocations);
    if (validation.error) return badRequest(validation.error);

    const transaction = {
      project_id: null,
      client_id: null,
      transaction_date: body.transaction_date || new Date().toISOString().slice(0, 10),
      competence_month: `${String(body.competence_month).slice(0, 7)}-01`,
      transaction_type: "cost",
      category_id: body.category_id || null,
      description: body.description,
      quantity: Number(body.quantity ?? 1),
      unit_amount_cents: Number(body.unit_amount_cents ?? gross),
      gross_amount_cents: gross,
      fee_profile_id: body.fee_profile_id || null,
      fee_amount_cents: fee,
      status: body.status || "paid",
      due_date: body.due_date || null,
      realized_at: (body.status || "paid") === "paid" ? (body.realized_at || body.transaction_date || new Date().toISOString().slice(0, 10)) : null,
      cost_scope: "shared",
      provider: body.provider || null,
      source: body.source || "manual",
      notes: body.notes || null,
    };

    const { data: created, error: createError } = await supabase.from("financial_transactions").insert(transaction).select("*").single();
    if (createError) throw createError;
    transactionId = created.id;

    const rows = allocations.map((a) => ({
      transaction_id: created.id,
      project_id: a.project_id,
      allocated_amount_cents: Number(a.allocated_amount_cents),
      percentage: a.percentage ?? null,
      allocation_method: a.allocation_method ?? "manual",
    }));
    const { error: allocationError } = await supabase.from("shared_cost_allocations").insert(rows);
    if (allocationError) throw allocationError;

    return ok({
      transaction: created,
      allocations: rows,
      allocated_amount_cents: validation.allocatedCents,
      holding_remainder_cents: validation.holdingRemainderCents,
    }, { status: 201 });
  } catch (error) {
    if (transactionId) await supabase.from("financial_transactions").delete().eq("id", transactionId);
    return serverError(error);
  }
}
