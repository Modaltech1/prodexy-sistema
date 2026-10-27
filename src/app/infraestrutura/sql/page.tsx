"use client";

import { useEffect, useState } from "react";
import { Clock3, Database, FilePlus2, Play, SquareTerminal } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import type { DatabaseInventoryResponse, SqlExecutionResponse, SqlResultSet } from "@/features/database-explorer/contracts";
import { requiresSqlConfirmation } from "@/features/database-explorer/sql-editor";

type QueryHistoryItem = {
  id: string;
  sql: string;
  databaseName: string;
  executedAt: string;
  ok: boolean;
};

const initialSql = "SELECT current_database(), current_user, now();";

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resultLabel(result: SqlResultSet, index: number) {
  const affected = result.rowCount === null ? "" : ` · ${result.rowCount} ${result.rowCount === 1 ? "linha" : "linhas"}`;
  return `${index + 1}. ${result.command || "Resultado"}${affected}`;
}

export default function SqlEditorPage() {
  const [inventory, setInventory] = useState<DatabaseInventoryResponse | null>(null);
  const [selectedId, setSelectedId] = useState("ph-outlet");
  const [sql, setSql] = useState(initialSql);
  const [result, setResult] = useState<SqlExecutionResponse | null>(null);
  const [selectedResult, setSelectedResult] = useState(0);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DatabaseInventoryResponse>("/api/infraestrutura/bancos")
      .then(setInventory)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar os bancos."));
    const timer = window.setTimeout(() => {
      const saved = sessionStorage.getItem("prodexy-sql-history");
      if (!saved) return;
      try { setHistory(JSON.parse(saved) as QueryHistoryItem[]); } catch { sessionStorage.removeItem("prodexy-sql-history"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const projects = inventory?.projects ?? [];
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0];
  const activeResult = result?.results[selectedResult] ?? null;
  const canRun = Boolean(sql.trim() && selected && !loading);

  function saveHistory(item: QueryHistoryItem) {
    setHistory((current) => {
      const next = [item, ...current].slice(0, 20);
      sessionStorage.setItem("prodexy-sql-history", JSON.stringify(next));
      return next;
    });
  }

  async function runSql() {
    if (!canRun || !selected) return;
    if (requiresSqlConfirmation(sql) && !window.confirm(`Executar este SQL em ${selected.databaseName}?`)) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedResult(0);
    const executedAt = new Date().toISOString();
    try {
      const response = await apiFetch<SqlExecutionResponse>(`/api/infraestrutura/sql/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        body: JSON.stringify({ sql }),
      });
      setResult(response);
      saveHistory({ id: crypto.randomUUID(), sql, databaseName: selected.databaseName, executedAt, ok: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao executar SQL.");
      saveHistory({ id: crypto.randomUUID(), sql, databaseName: selected.databaseName, executedAt, ok: false });
    } finally {
      setLoading(false);
    }
  }

  function newQuery() {
    setSql("");
    setResult(null);
    setError(null);
    setSelectedResult(0);
  }

  return <section className="sql-workspace" aria-label="SQL Editor">
    <aside className="sql-history">
      <button type="button" className="sql-new-query" onClick={newQuery}><FilePlus2 size={15}/>Nova consulta</button>
      <div className="sql-history-heading"><Clock3 size={14}/><span>Histórico desta sessão</span></div>
      <div className="sql-history-list">
        {history.map((item) => <button type="button" key={item.id} onClick={() => { setSql(item.sql); setError(null); setResult(null); }}><span className={item.ok ? "ok" : "error"}/><div><strong>{item.sql.split(/\r?\n/, 1)[0].slice(0, 44) || "Consulta SQL"}</strong><small>{item.databaseName} · {new Date(item.executedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></div></button>)}
        {!history.length ? <p>As consultas executadas nesta aba aparecerão aqui.</p> : null}
      </div>
    </aside>
    <div className="sql-main">
      <header className="sql-toolbar">
        <label><Database size={15}/><span className="sr-only">Database</span><select value={selected?.id ?? selectedId} onChange={(event) => setSelectedId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectName} — {project.databaseName}</option>)}</select></label>
        <span className="sql-connection-label">{selected?.nodeName ?? "Carregando databases…"}</span>
        <button type="button" className="sql-run" disabled={!canRun} onClick={runSql}><Play size={14} fill="currentColor"/>{loading ? "Executando…" : "Executar"}<kbd>Ctrl ↵</kbd></button>
      </header>
      <div className="sql-editor-pane">
        <div className="sql-editor-tab"><SquareTerminal size={15}/><span>Nova consulta</span></div>
        <textarea
          aria-label="Consulta SQL"
          spellCheck={false}
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void runSql(); } }}
          placeholder="Escreva sua consulta SQL…"
        />
      </div>
      <section className="sql-results" aria-label="Resultados SQL">
        <div className="sql-results-tabs">
          <strong>Resultados</strong>
          {result ? <span>{result.durationMs} ms · {result.databaseName}</span> : null}
        </div>
        {error ? <div className="sql-result-message error"><strong>Erro</strong><pre>{error}</pre></div> : result ? <>
          {result.results.length > 1 ? <div className="sql-result-set-tabs">{result.results.map((item, index) => <button type="button" className={selectedResult === index ? "active" : ""} key={`${item.command}-${index}`} onClick={() => setSelectedResult(index)}>{resultLabel(item, index)}</button>)}</div> : null}
          {activeResult?.columns.length ? <div className="sql-result-grid"><table><thead><tr>{activeResult.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{activeResult.rows.map((row, rowIndex) => <tr key={rowIndex}>{activeResult.columns.map((column) => { const value = formatCell(row[column]); return <td key={column} className={value === "NULL" ? "null" : ""} title={value}>{value}</td>; })}</tr>)}</tbody></table></div> : <div className="sql-result-message success"><strong>{activeResult?.command || "SQL executado"}</strong><span>{activeResult?.rowCount === null ? "Comando concluído." : `${activeResult?.rowCount ?? 0} linha(s) afetada(s).`}</span></div>}
        </> : <div className="sql-result-empty"><SquareTerminal size={24}/><span>Execute uma consulta para visualizar o resultado.</span></div>}
      </section>
    </div>
  </section>;
}
