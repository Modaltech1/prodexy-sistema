import { ok, serverError } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("app_settings").select("id").limit(1);
    if (error) throw error;
    return ok({ status: "ok", database: "connected" });
  } catch (error) {
    return serverError(error);
  }
}
