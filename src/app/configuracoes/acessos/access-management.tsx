"use client";

import Link from "next/link";
import {
  Check,
  Copy,
  FolderKanban,
  Handshake,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { AccessManagementData, ManagedAccess } from "@/lib/auth/contracts";
import { isValidAccessEmail, normalizeAccessEmail, passwordValidationMessage } from "@/lib/auth/contracts";
import { apiFetch } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

type Dialog = "create" | "edit" | "password" | "status" | "credentials" | "prerequisite" | null;
type Credentials = { email: string; temporaryPassword: string; reset: boolean };

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const random = crypto.getRandomValues(new Uint8Array(12));
  return `Px7!${Array.from(random, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Nunca acessou";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function projectSummary(user: ManagedAccess) {
  if (!user.projects.length) return "Nenhum projeto ativo";
  return user.projects.map((project) => `${project.name} (${project.participationPercentage.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`).join(", ");
}

function AccessOnboarding({ readiness, onCreate }: { readiness: "ready" | "partner" | "project"; onCreate: () => void }) {
  const ready = readiness === "ready";
  const needsProject = readiness === "project";
  return (
    <section className="panel access-onboarding">
      <div className="access-onboarding-icon"><ShieldCheck size={24} /></div>
      <div className="access-onboarding-copy">
        <h2>{ready ? "Crie o primeiro acesso" : "Prepare o primeiro acesso"}</h2>
        <p>{ready ? "Já existe um sócio com participação vigente disponível para receber uma conta." : needsProject ? "O sócio já está cadastrado, mas ainda precisa participar de um projeto." : "Uma conta representa um sócio externo e enxerga somente os projetos em que ele participa."}</p>
      </div>
      <ol className="access-onboarding-steps">
        <li className={readiness !== "partner" ? "complete" : ""}><Handshake size={16} /><span><strong>1. Sócio</strong><small>Cadastro externo ativo</small></span></li>
        <li className={ready ? "complete" : ""}><FolderKanban size={16} /><span><strong>2. Participação</strong><small>Percentual vigente no projeto</small></span></li>
        <li><KeyRound size={16} /><span><strong>3. Conta</strong><small>E-mail e senha temporária</small></span></li>
      </ol>
      <div className="access-onboarding-actions">
        {ready
          ? <Button type="button" onClick={onCreate}><Plus size={15} /> Criar acesso</Button>
          : needsProject
            ? <Link className="button button-primary" href="/projetos"><FolderKanban size={15} /> Vincular em projeto</Link>
            : <Link className="button button-primary" href="/configuracoes#partners"><Plus size={15} /> Cadastrar sócio</Link>}
        {!needsProject && <Link className="button button-secondary" href="/projetos"><FolderKanban size={15} /> Ver projetos</Link>}
      </div>
    </section>
  );
}

export function AccessManagement({ initialData }: { initialData: AccessManagementData }) {
  const [data, setData] = useState(initialData);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<ManagedAccess | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const availablePartners = useMemo(
    () => data.partners.filter((partner) => partner.active && (partner.projects.length > 0 || partner.linkedUserId === selected?.id) && (!partner.linkedUserId || partner.linkedUserId === selected?.id)),
    [data.partners, selected?.id],
  );
  const createCandidates = useMemo(
    () => data.partners.filter((partner) => partner.active && !partner.linkedUserId && partner.projects.length > 0),
    [data.partners],
  );
  const unlinkedActivePartners = useMemo(
    () => data.partners.filter((partner) => partner.active && !partner.linkedUserId),
    [data.partners],
  );
  const readiness = createCandidates.length ? "ready" : unlinkedActivePartners.length ? "project" : "partner";

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.users.filter((user) => {
      if (status === "active" && !user.active) return false;
      if (status === "inactive" && user.active) return false;
      if (!query) return true;
      return [user.displayName, user.email, user.partnerName, ...user.projects.map((project) => project.name)]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
    });
  }, [data.users, search, status]);

  async function refresh() {
    setData(await apiFetch<AccessManagementData>("/api/admin/accesses"));
  }

  function resetForm() {
    setSelected(null);
    setDisplayName("");
    setEmail("");
    setPartnerId("");
    setTemporaryPassword("");
    setPasswordConfirmation("");
    setCredentials(null);
    setError("");
    setCopied(false);
  }

  function closeDialog() {
    setDialog(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    if (!createCandidates.length) {
      setDialog("prerequisite");
      return;
    }
    setTemporaryPassword(generateTemporaryPassword());
    setDialog("create");
  }

  function openEdit(user: ManagedAccess) {
    resetForm();
    setSelected(user);
    setDisplayName(user.displayName);
    setEmail(user.email);
    setPartnerId(user.partnerId);
    setDialog("edit");
  }

  function openPasswordReset(user: ManagedAccess) {
    resetForm();
    setSelected(user);
    setEmail(user.email);
    setTemporaryPassword(generateTemporaryPassword());
    setDialog("password");
  }

  function openStatus(user: ManagedAccess) {
    resetForm();
    setSelected(user);
    setDialog("status");
  }

  function validatePasswordFields() {
    const message = passwordValidationMessage(temporaryPassword);
    if (message) return message;
    if (temporaryPassword !== passwordConfirmation) return "As senhas não coincidem.";
    return null;
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const passwordError = validatePasswordFields();
    if (!displayName.trim()) return setError("Informe o nome do usuário.");
    if (!isValidAccessEmail(email)) return setError("Informe um e-mail válido.");
    if (!partnerId) return setError("Selecione o sócio representado por este acesso.");
    if (passwordError) return setError(passwordError);

    setBusy(true);
    try {
      await apiFetch("/api/admin/accesses", {
        method: "POST",
        body: JSON.stringify({ displayName, email, partnerId, temporaryPassword }),
      });
      await refresh();
      setCredentials({ email: normalizeAccessEmail(email), temporaryPassword, reset: false });
      setDialog("credentials");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    if (!displayName.trim()) return setError("Informe o nome do usuário.");
    if (!partnerId) return setError("Selecione o sócio representado por este acesso.");
    setBusy(true);
    try {
      await apiFetch("/api/admin/accesses", {
        method: "PATCH",
        body: JSON.stringify({ action: "edit", userId: selected.id, displayName, partnerId }),
      });
      await refresh();
      closeDialog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const passwordError = validatePasswordFields();
    if (passwordError) return setError(passwordError);
    setBusy(true);
    try {
      await apiFetch("/api/admin/accesses", {
        method: "PATCH",
        body: JSON.stringify({ action: "reset-password", userId: selected.id, temporaryPassword }),
      });
      await refresh();
      setCredentials({ email: selected.email, temporaryPassword, reset: true });
      setDialog("credentials");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha.");
    } finally {
      setBusy(false);
    }
  }

  async function submitStatus() {
    if (!selected) return;
    setError("");
    setBusy(true);
    try {
      await apiFetch("/api/admin/accesses", {
        method: "PATCH",
        body: JSON.stringify({ action: "set-active", userId: selected.id, active: !selected.active }),
      });
      await refresh();
      closeDialog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    await navigator.clipboard.writeText(`E-mail: ${credentials.email}\nSenha temporária: ${credentials.temporaryPassword}`);
    setCopied(true);
  }

  const rowActions = (user: ManagedAccess) => (
    <div className="access-actions">
      <button className="icon-button" type="button" onClick={() => openEdit(user)} title="Editar acesso" aria-label={`Editar acesso de ${user.displayName}`}><Pencil size={15} /></button>
      <button className="icon-button" type="button" onClick={() => openPasswordReset(user)} title="Redefinir senha" aria-label={`Redefinir senha de ${user.displayName}`}><KeyRound size={15} /></button>
      <button className="icon-button" type="button" onClick={() => openStatus(user)} title={user.active ? "Desativar acesso" : "Reativar acesso"} aria-label={`${user.active ? "Desativar" : "Reativar"} acesso de ${user.displayName}`}>{user.active ? <UserX size={15} /> : <UserCheck size={15} />}</button>
    </div>
  );

  return (
    <>
      <div className="settings-section-header">
        <div><h2>Acessos de sócios</h2><p>Contas vinculadas aos participantes externos dos projetos.</p></div>
        <Button onClick={openCreate}><Plus size={15} /> Novo acesso</Button>
      </div>

      {data.users.length === 0 ? <AccessOnboarding readiness={readiness} onCreate={openCreate} /> : <>
        <div className="access-summary-strip"><span><strong>{data.users.length}</strong> contas</span><span><strong>{data.users.filter((user) => user.active).length}</strong> ativas</span><span><strong>{data.users.filter((user) => user.mustChangePassword && user.active).length}</strong> com senha temporária</span></div>
        <div className="filter-bar access-filters">
          <div className="field grow"><label htmlFor="access-search">Buscar</label><div className="input-with-icon"><Search size={15} /><input id="access-search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail, sócio ou projeto" /></div></div>
          <div className="field"><label htmlFor="access-status">Status</label><select id="access-status" className="select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></div>
        </div>

        <section className="panel access-desktop-table table-wrap">
          <table><thead><tr><th>Usuário</th><th>Sócio representado</th><th>Projetos</th><th>Último acesso</th><th>Status</th><th aria-label="Ações" /></tr></thead><tbody>
            {filteredUsers.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small className="table-secondary">{user.email}</small></td><td>{user.partnerName}{!user.partnerActive && <small className="table-secondary negative">Cadastro inativo</small>}</td><td className="access-projects-cell">{projectSummary(user)}</td><td>{formatDateTime(user.lastLoginAt)}</td><td><Badge tone={user.active ? user.mustChangePassword ? "warning" : "positive" : "neutral"}>{user.active ? user.mustChangePassword ? "Senha temporária" : "Ativo" : "Inativo"}</Badge></td><td>{rowActions(user)}</td></tr>)}
          </tbody></table>
          {!filteredUsers.length && <EmptyState title="Nenhum acesso encontrado" description="Ajuste os filtros para consultar outros acessos." />}
        </section>

        <div className="access-mobile-list">
          {filteredUsers.map((user) => <article className="panel access-mobile-item" key={user.id}><div className="access-mobile-heading"><div><strong>{user.displayName}</strong><span>{user.email}</span></div><Badge tone={user.active ? user.mustChangePassword ? "warning" : "positive" : "neutral"}>{user.active ? user.mustChangePassword ? "Senha temporária" : "Ativo" : "Inativo"}</Badge></div><dl><div><dt>Sócio</dt><dd>{user.partnerName}</dd></div><div><dt>Projetos</dt><dd>{projectSummary(user)}</dd></div><div><dt>Último acesso</dt><dd>{formatDateTime(user.lastLoginAt)}</dd></div></dl>{rowActions(user)}</article>)}
          {!filteredUsers.length && <section className="panel"><EmptyState title="Nenhum acesso encontrado" description="Ajuste os filtros para consultar outros acessos." /></section>}
        </div>
      </>}

      <Modal open={dialog === "prerequisite"} onClose={closeDialog} title="Antes de criar uma conta" width="560px">
        <div className="access-prerequisite"><div className="access-onboarding-icon">{readiness === "project" ? <FolderKanban size={22} /> : <Handshake size={22} />}</div><div><strong>{readiness === "project" ? "Participação ainda não definida" : "Nenhum sócio externo disponível"}</strong><p>{readiness === "project" ? "Abra um projeto e registre o percentual vigente desse sócio. Depois, volte aqui para criar a conta." : "Cadastre o sócio externo, vincule-o a um projeto e depois crie a conta de acesso."}</p></div></div>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={closeDialog}>Cancelar</Button><Link className="button button-primary" href={readiness === "project" ? "/projetos" : "/configuracoes#partners"}>{readiness === "project" ? "Ver projetos" : "Cadastrar sócio"}</Link></div>
      </Modal>

      <Modal open={dialog === "create"} onClose={closeDialog} title="Novo acesso de sócio" width="680px">
        <form onSubmit={submitCreate}>
          {error && <div className="error-box access-form-error" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="field"><label htmlFor="access-name">Nome do usuário</label><input id="access-name" className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus /></div>
            <div className="field"><label htmlFor="access-email">E-mail de login</label><input id="access-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" /></div>
            <div className="field full"><label htmlFor="access-partner">Sócio representado</label><select id="access-partner" className="select" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">Selecione</option>{availablePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></div>
            <div className="field"><label htmlFor="access-password">Senha temporária</label><div className="input-action"><input id="access-password" className="input" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="new-password" /><button type="button" className="icon-button" onClick={() => setTemporaryPassword(generateTemporaryPassword())} title="Gerar senha" aria-label="Gerar senha temporária"><RefreshCw size={15} /></button></div></div>
            <div className="field"><label htmlFor="access-confirmation">Confirmar senha</label><input id="access-confirmation" className="input" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" /></div>
          </div>
          <p className="auth-password-rule">Mínimo de 10 caracteres, com maiúscula, minúscula e número.</p>
          <div className="form-actions"><Button type="button" variant="secondary" onClick={closeDialog}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar acesso"}</Button></div>
        </form>
      </Modal>

      <Modal open={dialog === "edit"} onClose={closeDialog} title="Editar acesso" width="620px">
        <form onSubmit={submitEdit}>
          {error && <div className="error-box access-form-error" role="alert">{error}</div>}
          <div className="form-grid"><div className="field"><label htmlFor="edit-access-name">Nome do usuário</label><input id="edit-access-name" className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus /></div><div className="field"><label>E-mail de login</label><input className="input" value={email} disabled /></div><div className="field full"><label htmlFor="edit-access-partner">Sócio representado</label><select id="edit-access-partner" className="select" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">Selecione</option>{availablePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></div></div>
          <div className="form-actions"><Button type="button" variant="secondary" onClick={closeDialog}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button></div>
        </form>
      </Modal>

      <Modal open={dialog === "password"} onClose={closeDialog} title="Redefinir senha" width="620px">
        <form onSubmit={submitPasswordReset}>
          {error && <div className="error-box access-form-error" role="alert">{error}</div>}
          <div className="note access-context"><KeyRound size={16} /><span>{selected?.displayName}<small>{selected?.email}</small></span></div>
          <div className="form-grid"><div className="field"><label htmlFor="reset-access-password">Nova senha temporária</label><div className="input-action"><input id="reset-access-password" className="input" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="new-password" /><button type="button" className="icon-button" onClick={() => setTemporaryPassword(generateTemporaryPassword())} title="Gerar senha" aria-label="Gerar nova senha temporária"><RefreshCw size={15} /></button></div></div><div className="field"><label htmlFor="reset-access-confirmation">Confirmar senha</label><input id="reset-access-confirmation" className="input" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" /></div></div>
          <p className="auth-password-rule">O usuário deverá trocar esta senha no próximo acesso.</p>
          <div className="form-actions"><Button type="button" variant="secondary" onClick={closeDialog}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Redefinindo..." : "Redefinir senha"}</Button></div>
        </form>
      </Modal>

      <Modal open={dialog === "status"} onClose={closeDialog} title={selected?.active ? "Desativar acesso" : "Reativar acesso"} width="540px">
        {error && <div className="error-box access-form-error" role="alert">{error}</div>}
        <div className="access-confirmation"><div className={`access-confirmation-icon ${selected?.active ? "danger" : "positive"}`}>{selected?.active ? <UserX size={21} /> : <UserCheck size={21} />}</div><div><strong>{selected?.displayName}</strong><p>{selected?.active ? "O login deixará de acessar o portal imediatamente. Participações e históricos financeiros serão preservados." : "O login voltará a acessar os projetos atualmente vinculados ao sócio."}</p></div></div>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={closeDialog}>Cancelar</Button><Button type="button" variant={selected?.active ? "danger" : "primary"} onClick={submitStatus} disabled={busy}>{busy ? "Salvando..." : selected?.active ? "Desativar" : "Reativar"}</Button></div>
      </Modal>

      <Modal open={dialog === "credentials"} onClose={closeDialog} title={credentials?.reset ? "Senha redefinida" : "Acesso criado"} width="560px">
        <div className="access-created"><div className="access-created-icon"><ShieldCheck size={23} /></div><strong>{credentials?.reset ? "Nova credencial pronta" : "Credencial pronta"}</strong><p>Compartilhe estes dados por um canal seguro. A senha não ficará disponível novamente.</p><div className="credentials-box"><span>E-mail</span><strong>{credentials?.email}</strong><span>Senha temporária</span><strong>{credentials?.temporaryPassword}</strong></div><Button type="button" variant="secondary" onClick={copyCredentials}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copiado" : "Copiar credenciais"}</Button></div>
        <div className="form-actions"><Button type="button" onClick={closeDialog}>Concluir</Button></div>
      </Modal>
    </>
  );
}
