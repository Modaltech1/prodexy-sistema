import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ok, serverError } from "@/lib/api";
import { calculateFee } from "@/lib/finance";
import { todayInSaoPaulo } from "@/lib/date";

function addPeriod(dateStr: string, frequency: string, interval: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (frequency === "daily") date.setUTCDate(date.getUTCDate() + interval);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7 * interval);
  if (frequency === "monthly") date.setUTCMonth(date.getUTCMonth() + interval);
  if (frequency === "annual") date.setUTCFullYear(date.getUTCFullYear() + interval);
  if (frequency === "custom") date.setUTCDate(date.getUTCDate() + interval);
  return date.toISOString().slice(0, 10);
}

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const today = todayInSaoPaulo();
    let taskCount = 0;
    let financialCount = 0;

    const { data: taskTemplates, error: taskError } = await supabase
      .from("recurring_task_templates")
      .select("*")
      .eq("active", true)
      .lte("next_run_date", today);
    if (taskError) throw taskError;

    for (const template of taskTemplates ?? []) {
      const { error } = await supabase.from("tasks").insert({
        title: template.title,
        description: template.description,
        project_id: template.project_id,
        client_id: template.client_id,
        category_id: template.category_id,
        priority: template.priority,
        status: "inbox",
        estimated_minutes: template.estimated_minutes,
        recurring_template_id: template.id,
        origin: "Recorrência",
      });
      if (error) throw error;

      const next = addPeriod(template.next_run_date || today, template.frequency, template.interval_count || 1);
      const { error: updateError } = await supabase
        .from("recurring_task_templates")
        .update({ next_run_date: next })
        .eq("id", template.id);
      if (updateError) throw updateError;
      taskCount += 1;
    }

    const { data: financialTemplates, error: financialError } = await supabase
      .from("recurring_financial_templates")
      .select("*")
      .eq("active", true)
      .lte("next_due_date", today);
    if (financialError) throw financialError;

    const feeIds = [...new Set((financialTemplates ?? []).map((template) => template.fee_profile_id).filter(Boolean))];
    let feeMap = new Map<string, any>();
    if (feeIds.length) {
      const { data: fees, error: feesError } = await supabase.from("fee_profiles").select("*").in("id", feeIds);
      if (feesError) throw feesError;
      feeMap = new Map((fees ?? []).map((fee) => [fee.id, fee]));
    }

    const templateIds = (financialTemplates ?? []).map((template) => template.id);
    let recurringAllocations: any[] = [];
    if (templateIds.length) {
      const { data, error } = await supabase
        .from("recurring_financial_allocations")
        .select("*")
        .in("template_id", templateIds);
      if (error) throw error;
      recurringAllocations = data ?? [];
    }

    for (const template of financialTemplates ?? []) {
      const gross = Math.round(Number(template.quantity) * Number(template.unit_amount_cents));
      const profile = template.fee_profile_id ? feeMap.get(template.fee_profile_id) : null;
      const fee = profile ? calculateFee(gross, Number(profile.percentage), Number(profile.fixed_amount_cents)) : 0;
      const due = template.next_due_date || today;
      const competence = `${due.slice(0, 7)}-01`;

      const { data: createdTransaction, error } = await supabase
        .from("financial_transactions")
        .insert({
          project_id: template.project_id,
          client_id: template.client_id,
          transaction_date: due,
          competence_month: competence,
          transaction_type: template.transaction_type,
          category_id: template.category_id,
          description: template.description,
          quantity: template.quantity,
          unit_amount_cents: template.unit_amount_cents,
          gross_amount_cents: gross,
          fee_profile_id: template.fee_profile_id,
          fee_amount_cents: fee,
          status: "planned",
          due_date: due,
          cost_scope: template.transaction_type === "revenue" ? (template.project_id ? "direct" : "holding") : template.cost_scope,
          recurring_template_id: template.id,
          source: "recurrence",
        })
        .select("id")
        .single();
      if (error) throw error;

      if (template.transaction_type === "cost" && template.cost_scope === "shared") {
        const rules = recurringAllocations.filter((allocation) => allocation.template_id === template.id);
        const percentageSum = rules.reduce((sum, allocation) => sum + Number(allocation.allocation_percentage || 0), 0);
        if (!rules.length || Math.abs(percentageSum - 100) > 0.0001) {
          // Não deixa um custo compartilhado recorrente nascer sem rateio íntegro.
          await supabase.from("financial_transactions").delete().eq("id", createdTransaction.id);
          throw new Error(`A recorrência compartilhada “${template.name}” precisa ter rateios somando 100%.`);
        }

        const totalCost = gross + fee;
        const allocations = rules.map((rule) => ({
          transaction_id: createdTransaction.id,
          project_id: rule.project_id,
          allocated_amount_cents: Math.round(totalCost * Number(rule.allocation_percentage) / 100),
          allocation_percentage: Number(rule.allocation_percentage),
          allocation_method: "percentage",
        }));

        const allocated = allocations.reduce((sum, allocation) => sum + allocation.allocated_amount_cents, 0);
        const delta = totalCost - allocated;
        if (delta !== 0 && allocations.length) allocations[0].allocated_amount_cents += delta;

        const { error: allocationError } = await supabase.from("shared_cost_allocations").insert(allocations);
        if (allocationError) {
          await supabase.from("financial_transactions").delete().eq("id", createdTransaction.id);
          throw allocationError;
        }
      }

      const next = addPeriod(due, template.frequency, template.interval_count || 1);
      const { error: updateError } = await supabase
        .from("recurring_financial_templates")
        .update({ next_due_date: next })
        .eq("id", template.id);
      if (updateError) throw updateError;
      financialCount += 1;
    }

    return ok({ tasks_created: taskCount, financial_created: financialCount });
  } catch (error) {
    return serverError(error);
  }
}
