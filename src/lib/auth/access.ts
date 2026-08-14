import "server-only";
import { authEnabled } from "@/lib/auth/config";
import type { AppRole, CurrentAccess } from "@/lib/auth/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
    this.name = "AccessError";
  }
}

function legacyAdminAccess(): CurrentAccess {
  return {
    id: "legacy-admin",
    email: null,
    displayName: "Administrador",
    role: "admin",
    active: true,
    mustChangePassword: false,
    partnerId: null,
  };
}

export async function requireAccess(): Promise<CurrentAccess> {
  if (!authEnabled) return legacyAdminAccess();

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new AccessError("Sessão expirada ou inexistente.", 401);
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("app_users")
    .select("id, display_name, role, active, must_change_password")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || !profile.active) {
    throw new AccessError("Este acesso está inativo ou não foi configurado.", 403);
  }

  if (profile.role !== "admin" && profile.role !== "partner") {
    throw new AccessError("Este acesso possui um papel inválido.", 403);
  }
  const role = profile.role as AppRole;
  let partnerId: string | null = null;
  if (role === "partner") {
    const { data: link, error: linkError } = await admin
      .from("partner_user_links")
      .select("partner_id, partners(active, partner_type)")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (linkError) throw linkError;
    partnerId = String(link?.partner_id || "") || null;
    if (!partnerId) {
      throw new AccessError("Este login ainda não foi vinculado a um sócio.", 403);
    }
    const partner = Array.isArray(link?.partners) ? link.partners[0] : link?.partners;
    if (!partner || !partner.active || partner.partner_type !== "external") {
      throw new AccessError("O cadastro de sócio deste acesso está inativo.", 403);
    }
  }

  return {
    id: authData.user.id,
    email: authData.user.email ?? null,
    displayName: String(profile.display_name),
    role,
    active: Boolean(profile.active),
    mustChangePassword: Boolean(profile.must_change_password),
    partnerId,
  };
}

export async function requireAdmin() {
  const access = await requireAccess();
  if (access.role !== "admin") {
    throw new AccessError("Apenas administradores podem realizar esta operação.", 403);
  }
  if (access.mustChangePassword) {
    throw new AccessError("Troque a senha temporária antes de continuar.", 403);
  }
  return access;
}

export async function requirePartner(): Promise<CurrentAccess & { role: "partner"; partnerId: string }> {
  const access = await requireAccess();
  if (access.role !== "partner" || !access.partnerId) {
    throw new AccessError("Apenas sócios podem acessar este relatório.", 403);
  }
  if (access.mustChangePassword) {
    throw new AccessError("Troque a senha temporária antes de continuar.", 403);
  }
  return { ...access, role: "partner", partnerId: access.partnerId };
}
