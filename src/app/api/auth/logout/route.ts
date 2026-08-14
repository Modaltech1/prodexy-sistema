import { ok, serverError } from "@/lib/api";
import { authEnabled } from "@/lib/auth/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!authEnabled) return ok({ signedOut: true });
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return ok({ signedOut: true });
  } catch (error) {
    return serverError(error);
  }
}

