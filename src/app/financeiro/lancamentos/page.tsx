"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, Split, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { TransactionModal } from "@/components/transaction-modal";
import { apiFetch } from "@/lib/client-api";
import { currentCompetence, formatDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { useLookups } from "@/lib/use-lookups";

const statusLabels: Record<string, string> = {
  planned: "Previsto",
  received: "Recebido",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

const scopeLabels: Record<string, string> = {
  direct: "Direto",
  shared: "Compartilhado",
  holding: "Holding",
};

function statusTone(status: string) {
  if (status === "received" || status === "paid") return "positive";
  if (status === "overdue") return "negative";
  if (status === "cancelled") return "neutral";
  return "warning";
}

export default function TransactionsPage() {
  const lookups = useLookups();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentCompetence().slice(0, 7));
  const [basis, setBasis] = useState<"competence" | "cash">("competence");
  const [project, setProject] = useState("all");
  const [client, setClient] = useState("all");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [initialType, setInitialType] = useState<"revenue" | "cost">("revenue");
  const [editing, setEditing] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<any[]>("/api/crud/transactions?limit=2000"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const novo = params.get("novo");
    if (novo === "receita" || novo === "custo") {
      setInitialType(novo === "receita" ? "revenue" : "cost");
      setModal(true);
    }
  }, []);

  const projectMap = useMemo(() => new Map(lookups.projects.map((p) => [p.id, p.name])), [lookups.projects]);
  const clientMap = useMemo(() => new Map(lookups.clients.map((c) => [c.id, c.name])), [lookups.clients]);
  const categoryMap = useMemo(() => new Map(lookups.categories.map((c) => [c.id, c.name])), [lookups.categories]);

  const filtered = rows.filter((row) => {
    if (row.archived) return false;
    if (month) {
      if (basis === "competence" && !row.competence_month?.startsWith(month)) return false;
      if (basis === "cash" && !row.realized_at?.startsWith(month)) return false;
    }
    if (project !== "all") {
      if (project === "holding" && row.project_id) return false;
      if (project !== "holding" && row.project_id !== project) return false;
    }
    if (client !== "all" && row.client_id !== client) return false;
    if (category !== "all" && row.category_id !== category) return false;
    if (type !== "all" && row.transaction_type !== type) return false;
    if (status !== "all" && row.status !== status) return false;
    if (scope !== "all" && row.cost_scope !== scope) return false;
    if (search) {
      const haystack = `${row.description} ${row.provider || ""} ${clientMap.get(row.client_id) || ""}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totals = filtered.reduce(
    (acc, row) => {
      if (row.transaction_type === "revenue" && row.status === "received") {
        acc.revenue += Number(row.gross_amount_cents);
        acc.fees += Number(row.fee_amount_cents);
      }
      if (row.transaction_type === "cost" && row.status === "paid") {
        acc.cost += Number(row.gross_amount_cents) + Number(row.fee_amount_cents);
      }
      return acc;
    },
    { revenue: 0, fees: 0, cost: 0 },
  );

  const openNew = (newType: "revenue" | "cost") => {
    setEditing(null);
    setInitialType(newType);
    setModal(true);
  };

  const clearFilters = () => {
    setMonth(currentCompetence().slice(0, 7));
    setBasis("competence");
    setProject("all");
    setClient("all");
    setCategory("all");
    setType("all");
    setStatus("all");
    setScope("all");
    setSearch("");
  };

  const exportParams = new URLSearchParams({ format: "xlsx" });
  if (month) exportParams.set("month", month);
  exportParams.set("basis", basis);
  if (project === "holding") exportParams.set("holding", "1");
  else if (project !== "all") exportParams.set("project_id", project);
  if (client !== "all") exportParams.set("client_id", client);
  if (category !== "all") exportParams.set("category_id", category);
  if (type !== "all") exportParams.set("transaction_type", type);
  if (status !== "all") exportParams.set("status", status);
  if (scope !== "all") exportParams.set("cost_scope", scope);
  if (search) exportParams.set("q", search);

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Fonte de verdade dos recebimentos, despesas, taxas e previsões financeiras. Filtros combináveis para conferência e análise."
        actions={
          <>
            <Button variant="secondary" onClick={() => openNew("cost")}><Plus size={15} /> Custo</Button>
            <Button onClick={() => openNew("revenue")}><Plus size={15} /> Receita</Button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="field"><label>Base</label><select className="select" value={basis} onChange={(e) => setBasis(e.target.value as any)}><option value="competence">Competência</option><option value="cash">Caixa realizado</option></select></div>
        <div className="field"><label>Mês</label><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <div className="field"><label>Projeto</label><select className="select" value={project} onChange={(e) => setProject(e.target.value)}><option value="all">Todos</option><option value="holding">Prodexy / Holding</option>{lookups.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="field"><label>Cliente</label><select className="select" value={client} onChange={(e) => setClient(e.target.value)}><option value="all">Todos</option>{lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Categoria</label><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">Todas</option>{lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Tipo</label><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Todos</option><option value="revenue">Receita</option><option value="cost">Custo</option></select></div>
        <div className="field"><label>Status</label><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos</option>{Object.entries(statusLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></div>
        <div className="field"><label>Escopo</label><select className="select" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">Todos</option><option value="direct">Direto</option><option value="shared">Compartilhado</option><option value="holding">Holding</option></select></div>
        <div className="field grow"><label>Buscar</label><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Descrição, cliente ou provedor" /></div>
        <Button variant="ghost" onClick={clearFilters}><X size={14} /> Limpar</Button>
        <a className="button button-secondary" href={`/api/export/finance?${exportParams.toString()}`}><Download size={15} /> XLSX</a>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-top"><span>Receita bruta filtrada</span></div><strong>{formatMoney(totals.revenue)}</strong><small>Somente recebidos</small></div>
        <div className="kpi-card"><div className="kpi-top"><span>Taxas filtradas</span></div><strong>{formatMoney(totals.fees)}</strong><small>Sobre receitas recebidas</small></div>
        <div className="kpi-card kpi-negative"><div className="kpi-top"><span>Custos pagos</span></div><strong>{formatMoney(totals.cost)}</strong><small>Sem duplicar rateios</small></div>
        <div className="kpi-card"><div className="kpi-top"><span>Registros</span></div><strong>{filtered.length}</strong><small>Após filtros</small></div>
      </div>

      {loading ? (
        <LoadingBlock lines={8} />
      ) : (
        <section className="panel table-wrap">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhum lançamento encontrado" description="Ajuste os filtros ou adicione uma receita/custo." />
          ) : (
            <table>
              <thead><tr><th>Data</th><th>Realizado</th><th>Projeto</th><th>Cliente</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Status</th><th>Escopo</th><th className="numeric">Bruto</th><th className="numeric">Taxa</th><th className="numeric">Líquido</th><th></th></tr></thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.transaction_date)}</td>
                    <td>{formatDate(row.realized_at)}</td>
                    <td>{row.project_id ? projectMap.get(row.project_id) || "—" : "Prodexy / Holding"}</td>
                    <td>{row.client_id ? clientMap.get(row.client_id) || "—" : "—"}</td>
                    <td><Badge tone={row.transaction_type === "revenue" ? "positive" : "negative"}>{row.transaction_type === "revenue" ? "Receita" : "Custo"}</Badge></td>
                    <td>{categoryMap.get(row.category_id) || "—"}</td>
                    <td><strong>{row.description}</strong>{row.provider && <div className="muted">{row.provider}</div>}</td>
                    <td><Badge tone={statusTone(row.status) as any}>{statusLabels[row.status] || row.status}</Badge></td>
                    <td>{scopeLabels[row.cost_scope] || row.cost_scope}</td>
                    <td className="numeric">{formatMoney(row.gross_amount_cents)}</td>
                    <td className="numeric">{formatMoney(row.fee_amount_cents)}</td>
                    <td className={`numeric ${row.net_amount_cents < 0 ? "negative" : ""}`}>{formatMoney(row.net_amount_cents)}</td>
                    <td>{row.cost_scope === "shared" ? <a className="icon-button" href="/financeiro/custos-compartilhados" aria-label="Gerenciar custo compartilhado" title="Gerenciar em Custos compartilhados"><Split size={14} /></a> : <button className="icon-button" onClick={() => { setEditing(row); setInitialType(row.transaction_type); setModal(true); }} aria-label="Editar lançamento"><Pencil size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <TransactionModal open={modal} onClose={() => setModal(false)} onSaved={load} lookups={lookups} initialType={initialType} transaction={editing} />
    </>
  );
}
