import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/config";
import type { AppRole } from "@/lib/auth/types";
import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginInput = { email?: string; password?: string };

export async function POST(request: Request) {
  if (!authEnabled) {
    return NextResponse.json({ error: "O login ainda não foi ativado neste ambiente." }, { status: 503 });
  }

  try {
    const input = await readJson<LoginInput>(request);
    const email = input.email?.trim().toLowerCase();
    if (!email || !input.password) return badRequest("Informe e-mail e senha.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: input.password });
    if (error || !data.user) {
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("app_users")
      .select("display_name, role, active, must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const role = profile?.role;
    if (!profile || !profile.active || (role !== "admin" && role !== "partner")) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Este acesso está inativo ou não foi configurado." }, { status: 403 });
    }

    if (role === "partner") {
      const { data: link, error: linkError } = await admin
        .from("partner_user_links")
        .select("partner_id, partners(active, partner_type)")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (linkError) throw linkError;
      const linkedPartner = Array.isArray(link?.partners) ? link.partners[0] : link?.partners;
      if (!link || !linkedPartner || !linkedPartner.active || linkedPartner.partner_type !== "external") {
        await supabase.auth.signOut();
        return NextResponse.json({ error: "Este login não possui um sócio externo ativo vinculado." }, { status: 403 });
      }
    }

    const typedRole = role as AppRole;
    const mustChangePassword = Boolean(profile.must_change_password);
    const metadata = {
      ...data.user.app_metadata,
      role: typedRole,
      active: true,
      must_change_password: mustChangePassword,
    };
    await admin.auth.admin.updateUserById(data.user.id, { app_metadata: metadata });
    await supabase.auth.refreshSession();
    const { error: loginTrackingError } = await admin
      .from("app_users")
      .update({ email: email.toLowerCase(), last_login_at: new Date().toISOString() })
      .eq("id", data.user.id);
    if (loginTrackingError) console.error("Falha ao registrar o último acesso.", loginTrackingError);

    return ok({
      displayName: String(profile.display_name),
      role: typedRole,
      mustChangePassword,
      redirectTo: mustChangePassword ? "/alterar-senha" : typedRole === "admin" ? "/" : "/portal",
    });
  } catch (error) {
    return serverError(error);
  }
}
