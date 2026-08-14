import "server-only";
import type {
  AccessManagementData,
  CreatePartnerAccessInput,
  ManagedAccess,
  ManagedProjectSummary,
  PartnerAccessOption,
} from "@/lib/auth/contracts";
import { isValidAccessEmail, normalizeAccessEmail, passwordValidationMessage } from "@/lib/auth/contracts";
import { todayInSaoPaulo } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;

export class ManagedAccessError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "ManagedAccessError";
  }
}

function toRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function toRow(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function nestedRow(value: unknown): Row | null {
  if (Array.isArray(value)) return toRow(value[0]);
  return toRow(value);
}

function databaseError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

async function requirePartnerProfile(userId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("app_users")
    .select("id, role, active, must_change_password, display_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw databaseError(error, "Não foi possível consultar o acesso.");
  if (!data || data.role !== "partner") throw new ManagedAccessError("Acesso de sócio não encontrado.", 404);
  return data as Row;
}

async function requireLinkablePartner(partnerId: string, currentUserId?: string) {
  const admin = getSupabaseAdmin();
  const [{ data: partner, error: partnerError }, { data: link, error: linkError }] = await Promise.all([
    admin.from("partners").select("id, name, partner_type, active").eq("id", partnerId).maybeSingle(),
    admin.from("partner_user_links").select("user_id").eq("partner_id", partnerId).maybeSingle(),
  ]);
  if (partnerError) throw databaseError(partnerError, "Não foi possível consultar o sócio.");
  if (linkError) throw databaseError(linkError, "Não foi possível consultar o vínculo de acesso.");
  if (!partner || partner.partner_type !== "external" || !partner.active) {
    throw new ManagedAccessError("Selecione um sócio externo ativo.");
  }
  if (link && String(link.user_id) !== currentUserId) {
    throw new ManagedAccessError("Este sócio já possui um acesso vinculado.", 409);
  }
  return partner as Row;
}

export async function listPartnerAccesses(): Promise<AccessManagementData> {
  const admin = getSupabaseAdmin();
  const [profilesResult, linksResult, partnersResult] = await Promise.all([
    admin.from("app_users").select("id, display_name, email, active, must_change_password, last_login_at, created_at").eq("role", "partner").order("display_name"),
    admin.from("partner_user_links").select("user_id, partner_id"),
    admin.from("partners").select("id, name, active").eq("partner_type", "external").order("name"),
  ]);
  if (profilesResult.error) throw databaseError(profilesResult.error, "Não foi possível listar os acessos.");
  if (linksResult.error) throw databaseError(linksResult.error, "Não foi possível listar os vínculos.");
  if (partnersResult.error) throw databaseError(partnersResult.error, "Não foi possível listar os sócios.");

  const profiles = toRows(profilesResult.data);
  const links = toRows(linksResult.data);
  const partners = toRows(partnersResult.data);
  const linksByUser = new Map(links.map((row) => [String(row.user_id), String(row.partner_id)]));
  const linksByPartner = new Map(links.map((row) => [String(row.partner_id), String(row.user_id)]));
  const partnersById = new Map(partners.map((row) => [String(row.id), row]));
  const partnerIds = [...new Set(links.map((row) => String(row.partner_id)).filter(Boolean))];

  let participationRows: Row[] = [];
  if (partnerIds.length) {
    const today = todayInSaoPaulo();
    const { data, error } = await admin
      .from("project_partners")
      .select("partner_id, participation_percentage, projects(id, name)")
      .in("partner_id", partnerIds)
      .eq("active", true)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (error) throw databaseError(error, "Não foi possível listar os projetos dos sócios.");
    participationRows = toRows(data);
  }

  const projectsByPartner = new Map<string, ManagedProjectSummary[]>();
  for (const participation of participationRows) {
    const partnerId = String(participation.partner_id);
    const project = nestedRow(participation.projects);
    if (!project) continue;
    const current = projectsByPartner.get(partnerId) || [];
    current.push({
      id: String(project.id),
      name: String(project.name),
      participationPercentage: Number(participation.participation_percentage || 0),
    });
    projectsByPartner.set(partnerId, current);
  }

  const users: ManagedAccess[] = profiles.map((profile) => {
    const partnerId = linksByUser.get(String(profile.id));
    const partner = partnerId ? partnersById.get(partnerId) : null;
    return {
      id: String(profile.id),
      displayName: String(profile.display_name),
      email: String(profile.email),
      active: Boolean(profile.active),
      mustChangePassword: Boolean(profile.must_change_password),
      partnerId: partnerId || "",
      partnerName: partner ? String(partner.name) : "Vínculo ausente",
      partnerActive: Boolean(partner?.active),
      projects: (partnerId ? projectsByPartner.get(partnerId) || [] : []).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      lastLoginAt: profile.last_login_at ? String(profile.last_login_at) : null,
      createdAt: String(profile.created_at),
    };
  });

  const partnerOptions: PartnerAccessOption[] = partners.map((partner) => ({
    id: String(partner.id),
    name: String(partner.name),
    active: Boolean(partner.active),
    linkedUserId: linksByPartner.get(String(partner.id)) || null,
  }));

  return { users, partners: partnerOptions };
}

export async function createPartnerAccess(actorUserId: string, input: CreatePartnerAccessInput) {
  const admin = getSupabaseAdmin();
  const displayName = input.displayName.trim();
  const email = normalizeAccessEmail(input.email);
  if (!displayName) throw new ManagedAccessError("Informe o nome do usuário.");
  if (!isValidAccessEmail(email)) throw new ManagedAccessError("Informe um e-mail válido.");
  const passwordError = passwordValidationMessage(input.temporaryPassword);
  if (passwordError) throw new ManagedAccessError(passwordError);
  if (!input.partnerId) throw new ManagedAccessError("Selecione o sócio representado por este acesso.");

  await requireLinkablePartner(input.partnerId);
  const { data: duplicate, error: duplicateError } = await admin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (duplicateError) throw databaseError(duplicateError, "Não foi possível validar o e-mail.");
  if (duplicate) throw new ManagedAccessError("Já existe um acesso com este e-mail.", 409);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.temporaryPassword,
    email_confirm: true,
    app_metadata: { role: "partner", active: true, must_change_password: true },
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase().includes("already")
      ? "Já existe uma identidade com este e-mail."
      : createError?.message || "Não foi possível criar a identidade.";
    throw new ManagedAccessError(message, createError?.message?.toLowerCase().includes("already") ? 409 : 400);
  }

  try {
    const { error: profileError } = await admin.from("app_users").insert({
      id: created.user.id,
      display_name: displayName,
      email,
      role: "partner",
      active: true,
      must_change_password: true,
      created_by: actorUserId,
    });
    if (profileError) throw databaseError(profileError, "Não foi possível criar o perfil de acesso.");

    const { error: linkError } = await admin.from("partner_user_links").insert({
      user_id: created.user.id,
      partner_id: input.partnerId,
    });
    if (linkError) throw databaseError(linkError, "Não foi possível vincular o acesso ao sócio.");
  } catch (error) {
    const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
    if (rollbackError) console.error("Falha ao reverter identidade incompleta.", rollbackError);
    throw error;
  }

  return { id: created.user.id };
}

export async function editPartnerAccess(userId: string, displayNameInput: string, partnerId: string) {
  const admin = getSupabaseAdmin();
  const profile = await requirePartnerProfile(userId);
  const displayName = displayNameInput.trim();
  if (!displayName) throw new ManagedAccessError("Informe o nome do usuário.");
  if (!partnerId) throw new ManagedAccessError("Selecione o sócio representado por este acesso.");
  await requireLinkablePartner(partnerId, userId);

  const { data: previousLink, error: previousLinkError } = await admin
    .from("partner_user_links")
    .select("partner_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (previousLinkError) throw databaseError(previousLinkError, "Não foi possível consultar o vínculo atual.");
  const { error: linkError } = await admin
    .from("partner_user_links")
    .upsert({ user_id: userId, partner_id: partnerId }, { onConflict: "user_id" });
  if (linkError) throw databaseError(linkError, "Não foi possível atualizar o vínculo.");

  const { error: profileError } = await admin.from("app_users").update({ display_name: displayName }).eq("id", userId);
  if (profileError) {
    if (previousLink) {
      await admin.from("partner_user_links").upsert({ user_id: userId, partner_id: previousLink.partner_id }, { onConflict: "user_id" });
    } else {
      await admin.from("partner_user_links").delete().eq("user_id", userId);
    }
    throw databaseError(profileError, "Não foi possível atualizar o perfil.");
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (authUser.user) {
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...authUser.user.user_metadata, display_name: displayName },
    });
    if (authUpdateError) console.error("Falha ao sincronizar o nome nos metadados da identidade.", authUpdateError);
  }

  return { id: String(profile.id) };
}

export async function setPartnerAccessActive(userId: string, active: boolean) {
  const admin = getSupabaseAdmin();
  await requirePartnerProfile(userId);
  if (active) {
    const { data: link, error: linkError } = await admin
      .from("partner_user_links")
      .select("partner_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (linkError) throw databaseError(linkError, "Não foi possível consultar o vínculo do acesso.");
    if (!link) throw new ManagedAccessError("Vincule um sócio antes de reativar este acesso.");
    await requireLinkablePartner(String(link.partner_id), userId);
  }
  const { error } = await admin
    .from("app_users")
    .update({ active, deactivated_at: active ? null : new Date().toISOString() })
    .eq("id", userId);
  if (error) throw databaseError(error, "Não foi possível alterar o status do acesso.");

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (authUser.user) {
    const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...authUser.user.app_metadata, active },
    });
    if (metadataError) console.error("Falha ao sincronizar o status nos metadados da identidade.", metadataError);
  }
  return { id: userId, active };
}

export async function resetPartnerPassword(userId: string, temporaryPassword: string) {
  const admin = getSupabaseAdmin();
  const profile = await requirePartnerProfile(userId);
  const passwordError = passwordValidationMessage(temporaryPassword);
  if (passwordError) throw new ManagedAccessError(passwordError);

  const { error: profileError } = await admin
    .from("app_users")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (profileError) throw databaseError(profileError, "Não foi possível preparar a troca de senha.");

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
  if (authUserError || !authUser.user) {
    await admin.from("app_users").update({ must_change_password: Boolean(profile.must_change_password) }).eq("id", userId);
    throw databaseError(authUserError, "Não foi possível consultar a identidade.");
  }
  const { error: passwordErrorResult } = await admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
    app_metadata: { ...authUser.user.app_metadata, must_change_password: true },
  });
  if (passwordErrorResult) {
    await admin.from("app_users").update({ must_change_password: Boolean(profile.must_change_password) }).eq("id", userId);
    throw databaseError(passwordErrorResult, "Não foi possível redefinir a senha.");
  }
  return { id: userId };
}
