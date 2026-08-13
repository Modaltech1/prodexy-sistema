import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ok, serverError } from "@/lib/api";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [projects, clients, categories, fees, partners, taskCategories, plans] = await Promise.all([
      supabase.from("projects").select("*").neq("status", "archived").order("name"),
      supabase.from("clients").select("*").neq("status", "archived").order("name"),
      supabase.from("financial_categories").select("*").eq("active", true).order("name"),
      supabase.from("fee_profiles").select("*").eq("active", true).order("name"),
      supabase.from("partners").select("*").eq("active", true).order("name"),
      supabase.from("task_categories").select("*").eq("active", true).order("name"),
      supabase.from("plans").select("*").eq("active", true).order("name"),
    ]);
    for (const result of [projects, clients, categories, fees, partners, taskCategories, plans]) if (result.error) throw result.error;
    return ok({
      projects: projects.data ?? [], clients: clients.data ?? [], categories: categories.data ?? [],
      feeProfiles: fees.data ?? [], partners: partners.data ?? [], taskCategories: taskCategories.data ?? [], plans: plans.data ?? [],
    });
  } catch (error) {
    return serverError(error);
  }
}
