"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, crudCreate, crudUpdate } from "@/lib/client-api";
import { formatDate, todayInSaoPaulo } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import type { Client } from "@/lib/types";
import { useLookups } from "@/lib/use-lookups";

type ClientStatus = "active" | "inactive" | "cancelled";
type StatusFilter = "all" | ClientStatus;
type ProjectRelation = { id: string; project_id: string; client_id: string; active: boolean };
type Subscription = { id: string; project_id: string; client_id: string; monthly_amount_cents: number; status: string };

const statusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  cancelled: "Cancelado",
};

export default function ClientsPage() {
  const deepLinkHandled = useRef(false);
  const lookups = useLookups();
  const [clients, setClients] = useState<Client[]>([]);
  const [relations, setRelations] = useState<ProjectRelation[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [clientRows, relationRows, subscriptionRows] = await Promise.all([
        apiFetch<Client[]>("/api/crud/clients?limit=2000"),
        apiFetch<ProjectRelation[]>("/api/crud/project-clients?limit=4000"),
        apiFetch<Subscription[]>("/api/crud/subscriptions?limit=4000"),
      ]);
      setClients(clientRows.filter((client) => client.status !== "archived"));
      setRelations(relationRows);
      setSubscriptions(subscriptionRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("novo")) openNew();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (deepLinkHandled.current || !clients.length) return;
    const timer = window.setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get("cliente");
      if (id) {
        const target = clients.find((client) => client.id === id);
        if (target) openEdit(target);
      }
      deepLinkHandled.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clients]);

  const projectMap = useMemo(() => new Map(lookups.projects.map((item) => [item.id, item.name])), [lookups.projects]);
  const filtered = clients.filter((client) => {
    const statusMatches = statusFilter === "all" || client.status === statusFilter;
    const projectMatches = project === "all" || relations.some((relation) => relation.client_id === client.id && relation.project_id === project && relation.active);
    const haystack = `${client.name} ${client.contact_name || ""} ${client.phone || ""} ${client.email || ""}`.toLowerCase();
    return statusMatches && projectMatches && (!search || haystack.includes(search.toLowerCase()));
  });

  function openNew() {
    setEditing(null);
    setName("");
    setContact("");
    setPhone("");
    setEmail("");
    setStatus("active");
    setEntryDate(todayInSaoPaulo());
    setNotes("");
    setError("");
    setModal(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setName(client.name || client.company_name || "");
    setContact(client.contact_name || "");
    setPhone(client.phone || "");
    setEmail(client.email || "");
    setStatus(["active", "inactive", "cancelled"].includes(client.status) ? client.status as ClientStatus : "active");
    setEntryDate(client.entry_date || "");
    setNotes(client.notes || "");
    setError("");
    setModal(true);
  }

  const save = async () => {
    if (!name.trim()) {
      setError("Empresa obrigatória.");
      return;
    }
    setSaving(true);
    setError("");
    const companyName = name.trim();
    const payload = {
      name: companyName,
      company_name: companyName,
      contact_name: contact || null,
      phone: phone || null,
      email: email || null,
      status,
      entry_date: entryDate || null,
      notes: notes || null,
    };
    try {
      if (editing) await crudUpdate("clients", editing.id, payload);
      else await crudCreate("clients", payload);
      setModal(false);
      await load();
      await lookups.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setProject("all");
    setStatusFilter("all");
  };

  return <>
    <PageHeader title="Clientes" description="Empresas com vínculo ativo ou histórico com os projetos da Prodexy." actions={<Button onClick={openNew}><Plus size={15} /> Novo cliente</Button>} />
    <div className="filter-bar">
      <div className="field grow"><label>Buscar</label><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Empresa, responsável, telefone ou e-mail" /></div>
      <div className="field"><label>Projeto</label><select className="select" value={project} onChange={(event) => setProject(event.target.value)}><option value="all">Todos</option>{lookups.projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
      <div className="field"><label>Status</label><select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Todos os clientes</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="cancelled">Cancelados</option></select></div>
      {(search || project !== "all" || statusFilter !== "all") && <Button variant="ghost" onClick={clearFilters}><X size={14} /> Limpar</Button>}
    </div>

    {loading ? <LoadingBlock lines={7} /> : <section className="panel table-wrap">
      {filtered.length === 0 ? <EmptyState title="Nenhum cliente encontrado" /> : <table>
        <thead><tr><th>Empresa</th><th>Responsável</th><th>Projetos</th><th>Assinaturas</th><th>Status</th><th>Entrada</th><th></th></tr></thead>
        <tbody>{filtered.map((client) => {
          const clientRelations = relations.filter((relation) => relation.client_id === client.id && relation.active);
          const activeSubscriptions = subscriptions.filter((subscription) => subscription.client_id === client.id && ["active", "trial", "overdue"].includes(subscription.status));
          return <tr key={client.id}>
            <td><strong>{client.name || "Sem empresa"}</strong></td>
            <td>{client.contact_name || "—"}<div className="muted">{client.email || client.phone || ""}</div></td>
            <td>{clientRelations.length ? clientRelations.map((relation) => projectMap.get(relation.project_id) || "Projeto").join(" · ") : "—"}</td>
            <td>{activeSubscriptions.length ? <div>{activeSubscriptions.map((subscription) => <div key={subscription.id}>{projectMap.get(subscription.project_id) || "SaaS"}: <strong>{formatMoney(subscription.monthly_amount_cents)}/mês</strong></div>)}</div> : "—"}</td>
            <td><Badge tone={client.status === "active" ? "positive" : client.status === "cancelled" ? "negative" : "neutral"}>{statusLabels[client.status] || client.status}</Badge></td>
            <td>{formatDate(client.entry_date)}</td>
            <td><button className="icon-button" onClick={() => openEdit(client)} aria-label="Editar cliente" title="Editar cliente"><Pencil size={14} /></button></td>
          </tr>;
        })}</tbody>
      </table>}
    </section>}

    <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar cliente" : "Novo cliente"}>
      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-grid">
        <div className="field full"><label>Empresa</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="field"><label>Pessoa de contato</label><input className="input" value={contact} onChange={(event) => setContact(event.target.value)} /></div>
        <div className="field"><label>Telefone</label><input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="field"><label>Status</label><select className="select" value={status} onChange={(event) => setStatus(event.target.value as ClientStatus)}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="cancelled">Cancelado</option></select></div>
        <div className="field"><label>Data de entrada</label><input className="input" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></div>
        <div className="field full"><label>Observações</label><textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      </div>
      <div className="form-actions"><Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar cliente"}</Button></div>
    </Modal>
  </>;
}
