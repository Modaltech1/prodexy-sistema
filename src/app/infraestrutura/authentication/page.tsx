"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleOff,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  UsersRound,
} from "lucide-react";
import type { CognitoAdminSnapshot, CognitoUserSummary } from "@/features/cognito-admin/contracts";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

type Dialog = "create" | "edit" | "password" | "confirm" | null;
type ConfirmAction = "reset-password" | "sign-out" | "set-enabled" | "delete";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function statusLabel(status: string) {
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "FORCE_CHANGE_PASSWORD") return "Troca de senha pendente";
  if (status === "RESET_REQUIRED") return "Redefinição pendente";
  if (status === "UNCONFIRMED") return "Não confirmado";
  return status;
}

function confirmationCopy(action: ConfirmAction | null, user: CognitoUserSummary | null) {
  if (action === "delete") return { title: "Excluir usuário", description: "O usuário será removido permanentemente deste User Pool.", button: "Excluir", danger: true };
  if (action === "sign-out") return { title: "Encerrar sessões", description: "Todos os tokens ativos deste usuário serão invalidados.", button: "Encerrar sessões", danger: true };
  if (action === "reset-password") return { title: "Enviar redefinição de senha", description: "O Cognito enviará o fluxo de redefinição para o canal verificado do usuário.", button: "Enviar redefinição", danger: false };
  if (action === "set-enabled" && user?.enabled) return { title: "Bloquear usuário", description: "O usuário deixará de autenticar até ser reativado.", button: "Bloquear", danger: true };
  return { title: "Reativar usuário", description: "O usuário poderá voltar a autenticar neste projeto.", button: "Reativar", danger: false };
}

export default function AuthenticationPage() {
  const [snapshot, setSnapshot] = useState<CognitoAdminSnapshot | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedUser, setSelectedUser] = useState<CognitoUserSummary | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [permanentPassword, setPermanentPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (selectedTargetId) params.set("targetId", selectedTargetId);
    if (search) params.set("q", search);
    apiFetch<CognitoAdminSnapshot>(`/api/infraestrutura/authentication${params.size ? `?${params}` : ""}`)
      .then((data) => { if (active) setSnapshot(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível consultar o Authentication."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, search, selectedTargetId]);

  const selectedTarget = useMemo(
    () => snapshot?.targets.find((target) => target.id === selectedTargetId) ?? null,
    [selectedTargetId, snapshot?.targets],
  );

  function selectTarget(targetId: string) {
    if (targetId === selectedTargetId) return;
    setLoading(true);
    setError(null);
    setSelectedTargetId(targetId || null);
    setSearchDraft("");
    setSearch("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchDraft.trim();
    if (nextSearch === search) return;
    setLoading(true);
    setError(null);
    setSearch(nextSearch);
  }

  function resetDialog() {
    setDialog(null);
    setSelectedUser(null);
    setConfirmAction(null);
    setEmail("");
    setPassword("");
    setPasswordConfirmation("");
    setPermanentPassword(false);
    setFormError(null);
    setBusy(false);
  }

  function openCreate() {
    resetDialog();
    setDialog("create");
  }

  function openEdit(user: CognitoUserSummary) {
    resetDialog();
    setSelectedUser(user);
    setEmail(user.email ?? "");
    setDialog("edit");
  }

  function openPassword(user: CognitoUserSummary) {
    resetDialog();
    setSelectedUser(user);
    setDialog("password");
  }

  function openConfirmation(user: CognitoUserSummary, action: ConfirmAction) {
    resetDialog();
    setSelectedUser(user);
    setConfirmAction(action);
    setDialog("confirm");
  }

  function refreshAfterMutation() {
    resetDialog();
    setLoading(true);
    setError(null);
    setRevision((current) => current + 1);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTargetId) return;
    setBusy(true);
    setFormError(null);
    try {
      await apiFetch("/api/infraestrutura/authentication", {
        method: "POST",
        body: JSON.stringify({ targetId: selectedTargetId, email }),
      });
      refreshAfterMutation();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível criar o usuário.");
      setBusy(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTargetId || !selectedUser) return;
    setBusy(true);
    setFormError(null);
    try {
      await apiFetch("/api/infraestrutura/authentication", {
        method: "PATCH",
        body: JSON.stringify({ action: "update-email", targetId: selectedTargetId, username: selectedUser.username, email }),
      });
      refreshAfterMutation();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível atualizar o usuário.");
      setBusy(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTargetId || !selectedUser) return;
    setFormError(null);
    if (password !== passwordConfirmation) return setFormError("As senhas não coincidem.");
    setBusy(true);
    try {
      await apiFetch("/api/infraestrutura/authentication", {
        method: "PATCH",
        body: JSON.stringify({ action: "set-password", targetId: selectedTargetId, username: selectedUser.username, password, permanent: permanentPassword }),
      });
      refreshAfterMutation();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível definir a senha.");
      setBusy(false);
    }
  }

  async function submitConfirmation() {
    if (!selectedTargetId || !selectedUser || !confirmAction) return;
    setBusy(true);
    setFormError(null);
    try {
      if (confirmAction === "delete") {
        await apiFetch("/api/infraestrutura/authentication", {
          method: "DELETE",
          body: JSON.stringify({ targetId: selectedTargetId, username: selectedUser.username }),
        });
      } else {
        const payload = confirmAction === "set-enabled"
          ? { action: confirmAction, targetId: selectedTargetId, username: selectedUser.username, enabled: !selectedUser.enabled }
          : { action: confirmAction, targetId: selectedTargetId, username: selectedUser.username };
        await apiFetch("/api/infraestrutura/authentication", { method: "PATCH", body: JSON.stringify(payload) });
      }
      refreshAfterMutation();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
      setBusy(false);
    }
  }

  const confirmation = confirmationCopy(confirmAction, selectedUser);

  return <>
    <section className="cognito-workspace" aria-label="Authentication Cognito">
      <header className="cognito-target-toolbar">
        <label className="dbx-project-picker"><ShieldCheck size={17} aria-hidden="true"/><span className="sr-only">Projeto, database e User Pool</span><select value={selectedTargetId ?? ""} onChange={(event) => selectTarget(event.target.value)} aria-label="Projeto, database e User Pool"><option value="">Selecione o projeto e o database</option>{snapshot?.targets.map((target) => <option key={target.id} value={target.id}>{target.projectName} — {target.databaseName}</option>)}</select></label>
        {selectedTarget ? <div className="cognito-target-context"><span>{selectedTarget.nodeName}</span><i aria-hidden="true"/><span>{selectedTarget.poolName}</span><i aria-hidden="true"/><span>{selectedTarget.poolScope === "shared-dedicated" ? "Pool compartilhado" : "Pool do produto"}</span></div> : <span className="cognito-target-hint">A seleção define exatamente quais usuários serão administrados.</span>}
      </header>
      <div className="cognito-main">
        {!selectedTargetId ? <div className="cognito-empty"><div><UsersRound size={27}/></div><h1>Selecione um projeto</h1><p>Escolha explicitamente o projeto e o database antes de consultar os usuários.</p>{!loading && snapshot && !snapshot.configured ? <span role="status">A credencial server-side ainda não foi configurada. Nenhum User Pool foi consultado.</span> : error ? <span role="alert">{error}</span> : null}</div> : <>
          <header className="cognito-header"><div><span>Usuários</span><h1>{selectedTarget?.projectName ?? "Projeto"}</h1><small>{selectedTarget?.databaseName} · {selectedTarget?.poolId}</small></div><div className="cognito-header-actions"><div className="cognito-count"><strong>{snapshot?.users.length ?? 0}</strong><span>usuários exibidos</span></div><Button type="button" onClick={openCreate} disabled={!snapshot?.configured}><Plus size={15}/>Novo usuário</Button></div></header>
          <form className="cognito-toolbar" onSubmit={submitSearch}><label><Search size={15}/><span className="sr-only">Buscar usuários</span><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por e-mail, username ou status" maxLength={100}/></label><button type="submit">Buscar</button>{search ? <button type="button" className="secondary" onClick={() => { setLoading(true); setError(null); setSearchDraft(""); setSearch(""); }}>Limpar</button> : null}</form>
          {!snapshot?.configured ? <div className="cognito-state"><ShieldCheck size={20}/><strong>Credencial server-side ainda não configurada.</strong></div> : error ? <div className="cognito-state error" role="alert"><CircleOff size={20}/><strong>{error}</strong></div> : loading ? <div className="cognito-state">Consultando usuários…</div> : <div className="cognito-users"><table><thead><tr><th>Usuário</th><th>Status</th><th>E-mail verificado</th><th>Criado em</th><th>Atualizado em</th><th aria-label="Ações"/></tr></thead><tbody>{snapshot?.users.map((user) => <tr key={user.username}><td><strong>{user.email || user.username}</strong><small>{user.email ? user.username : "Sem e-mail cadastrado"}</small></td><td><span className={`cognito-status ${user.enabled ? "enabled" : "disabled"}`}>{user.enabled ? <CheckCircle2 size={13}/> : <CircleOff size={13}/>} {user.enabled ? statusLabel(user.status) : "Bloqueado"}</span></td><td>{user.emailVerified ? "Sim" : "Não"}</td><td>{formatDate(user.createdAt)}</td><td>{formatDate(user.lastModifiedAt)}</td><td><RowActionsMenu label={`Opções de ${user.email || user.username}`} actions={[
            { label: "Editar e-mail", icon: <Pencil size={15}/>, onSelect: () => openEdit(user) },
            { label: "Definir senha", icon: <KeyRound size={15}/>, onSelect: () => openPassword(user) },
            { label: "Enviar redefinição", icon: <Mail size={15}/>, onSelect: () => openConfirmation(user, "reset-password") },
            { label: "Encerrar sessões", icon: <LogOut size={15}/>, onSelect: () => openConfirmation(user, "sign-out") },
            { label: user.enabled ? "Bloquear usuário" : "Reativar usuário", icon: user.enabled ? <UserX size={15}/> : <UserCheck size={15}/>, onSelect: () => openConfirmation(user, "set-enabled"), tone: user.enabled ? "danger" : "default" },
            { label: "Excluir usuário", icon: <Trash2 size={15}/>, onSelect: () => openConfirmation(user, "delete"), tone: "danger" },
          ]}/></td></tr>)}{!snapshot?.users.length ? <tr><td colSpan={6} className="empty"><KeyRound size={18}/> Nenhum usuário encontrado.</td></tr> : null}</tbody></table></div>}
        </>}
      </div>
    </section>

    <Modal open={dialog === "create"} onClose={resetDialog} title="Novo usuário" width="520px">
      <form onSubmit={submitCreate}>{formError ? <div className="error-box" role="alert">{formError}</div> : null}<div className="field"><label htmlFor="cognito-create-email">E-mail</label><input id="cognito-create-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required/></div><p className="cognito-form-note">O Cognito enviará o convite conforme a configuração deste User Pool.</p><div className="form-actions"><Button type="button" variant="secondary" onClick={resetDialog}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar usuário"}</Button></div></form>
    </Modal>

    <Modal open={dialog === "edit"} onClose={resetDialog} title="Editar e-mail" width="520px">
      <form onSubmit={submitEdit}>{formError ? <div className="error-box" role="alert">{formError}</div> : null}<div className="field"><label>Username</label><input className="input" value={selectedUser?.username ?? ""} disabled/></div><div className="field cognito-form-field"><label htmlFor="cognito-edit-email">Novo e-mail</label><input id="cognito-edit-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required/></div><p className="cognito-form-note">O novo endereço ficará não verificado até concluir o fluxo do Cognito.</p><div className="form-actions"><Button type="button" variant="secondary" onClick={resetDialog}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div></form>
    </Modal>

    <Modal open={dialog === "password"} onClose={resetDialog} title="Definir senha" width="560px">
      <form onSubmit={submitPassword}>{formError ? <div className="error-box" role="alert">{formError}</div> : null}<div className="field"><label htmlFor="cognito-password">Nova senha</label><input id="cognito-password" className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" autoFocus required minLength={8}/></div><div className="field cognito-form-field"><label htmlFor="cognito-password-confirmation">Confirmar senha</label><input id="cognito-password-confirmation" className="input" type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" required minLength={8}/></div><label className="cognito-password-option"><input type="checkbox" checked={permanentPassword} onChange={(event) => setPermanentPassword(event.target.checked)}/><span><strong>Senha permanente</strong><small>Se desmarcada, o usuário deverá trocar a senha no próximo login.</small></span></label><div className="form-actions"><Button type="button" variant="secondary" onClick={resetDialog}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Definindo…" : "Definir senha"}</Button></div></form>
    </Modal>

    <Modal open={dialog === "confirm"} onClose={resetDialog} title={confirmation.title} width="520px">
      {formError ? <div className="error-box" role="alert">{formError}</div> : null}<div className="cognito-confirmation"><div className={confirmation.danger ? "danger" : "default"}>{confirmation.danger ? <CircleOff size={20}/> : <ShieldCheck size={20}/>}</div><span><strong>{selectedUser?.email || selectedUser?.username}</strong><p>{confirmation.description}</p></span></div><div className="form-actions"><Button type="button" variant="secondary" onClick={resetDialog}>Cancelar</Button><Button type="button" variant={confirmation.danger ? "danger" : "primary"} onClick={submitConfirmation} disabled={busy}>{busy ? "Processando…" : confirmation.button}</Button></div>
    </Modal>
  </>;
}
