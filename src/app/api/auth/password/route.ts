import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { authEnabled } from "@/lib/auth/config";
import { requireAccess } from "@/lib/auth/access";
import { passwordValidationMessage } from "@/lib/auth/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PasswordInput = { password?: string };

export async function PATCH(request: Request) {
  if (!authEnabled) return badRequest("O login ainda não foi ativado neste ambiente.");

  try {
    const access = await requireAccess();
    const input = await readJson<PasswordInput>(request);
    const password = input.password || "";
    const passwordError = passwordValidationMessage(password);
    if (passwordError) return badRequest(passwordError);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error || !data.user) throw error || new Error("Não foi possível atualizar a senha.");

    const admin = getSupabaseAdmin();
    const { error: profileError } = await admin
      .from("app_users")
      .update({ must_change_password: false })
      .eq("id", access.id);
    if (profileError) throw profileError;

    const { error: metadataError } = await admin.auth.admin.updateUserById(access.id, {
      app_metadata: { ...data.user.app_metadata, must_change_password: false },
    });
    if (metadataError) throw metadataError;
    await supabase.auth.refreshSession();

    return ok({ redirectTo: access.role === "admin" ? "/" : "/portal" });
  } catch (error) {
    return serverError(error);
  }
}
