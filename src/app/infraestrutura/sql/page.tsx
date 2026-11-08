"use client";

import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Clipboard, Clock3, Database, Download, FilePlus2, Play, SquareTerminal, Table2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import type { DatabaseInventoryResponse, SqlExecutionResponse } from "@/features/database-explorer/contracts";
import { getPrimarySqlResult, serializeSqlResultAsCsv, serializeSqlResultAsJson, serializeSqlResultAsMarkdown } from "@/features/database-explorer/sql-editor";

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

export default function SqlEditorPage() {
  const [inventory, setInventory] = useState<DatabaseInventoryResponse | null>(null);
  const [selectedId, setSelectedId] = useState("ph-outlet");
  const [sql, setSql] = useState(initialSql);
  const [result, setResult] = useState<SqlExecutionResponse | null>(null);
  const [resultView, setResultView] = useState<"table" | "json">("table");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);

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
  const activeResult = result ? getPrimarySqlResult(result.results) : null;
  const hasTabularResult = Boolean(activeResult?.columns.length);
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
    setLoading(true);
    setError(null);
    setResult(null);
    setResultView("table");
    setExportMessage(null);
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
    setResultView("table");
    setExportMessage(null);
  }

  async function copyResult(content: string, label: string) {
    try {
      await navigator.clipboard.writeText(content);
      setExportMessage(`${label} copiado.`);
    } catch {
      setExportMessage("Não foi possível copiar.");
    } finally {
      if (exportMenuRef.current) exportMenuRef.current.open = false;
    }
  }

  function downloadCsv() {
    if (!activeResult || !selected) return;
    const blob = new Blob([serializeSqlResultAsCsv(activeResult)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.databaseName}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    exportMenuRef.current?.removeAttribute("open");
    setExportMessage("CSV baixado.");
  }

  return <section className="sql-workspace" aria-label="SQL Editor">
    <aside className="sql-history">
      <button type="button" className="sql-new-query" onClick={newQuery}><FilePlus2 size={15}/>Nova consulta</button>
      <div className="sql-history-heading"><Clock3 size={14}/><span>Histórico desta sessão</span></div>
      <div className="sql-history-list">
        {history.map((item) => <button type="button" key={item.id} onClick={() => { setSql(item.sql); setError(null); setResult(null); setResultView("table"); setExportMessage(null); }}><span className={item.ok ? "ok" : "error"}/><div><strong>{item.sql.split(/\r?\n/, 1)[0].slice(0, 44) || "Consulta SQL"}</strong><small>{item.databaseName} · {new Date(item.executedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></div></button>)}
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
          <div className="sql-results-heading"><strong>Resultados</strong>{result ? <span>{activeResult?.rows.length ?? 0} {(activeResult?.rows.length ?? 0) === 1 ? "linha" : "linhas"} · {result.durationMs} ms</span> : null}</div>
          {hasTabularResult && activeResult ? <div className="sql-results-actions">
            <div className="sql-result-view" role="tablist" aria-label="Formato do resultado">
              <button type="button" role="tab" aria-selected={resultView === "table"} className={resultView === "table" ? "active" : ""} onClick={() => setResultView("table")}><Table2 size={13}/>Tabela</button>
              <button type="button" role="tab" aria-selected={resultView === "json"} className={resultView === "json" ? "active" : ""} onClick={() => setResultView("json")}><Braces size={13}/>JSON</button>
            </div>
            <details className="sql-export-menu" ref={exportMenuRef}>
              <summary>Exportar<ChevronDown size={13}/></summary>
              <div>
                <button type="button" onClick={() => void copyResult(serializeSqlResultAsMarkdown(activeResult), "Markdown")}><Clipboard size={13}/>Copiar como Markdown</button>
                <button type="button" onClick={() => void copyResult(serializeSqlResultAsJson(activeResult), "JSON")}><Clipboard size={13}/>Copiar como JSON</button>
                <button type="button" onClick={() => void copyResult(serializeSqlResultAsCsv(activeResult), "CSV")}><Clipboard size={13}/>Copiar como CSV</button>
                <button type="button" onClick={downloadCsv}><Download size={13}/>Baixar CSV</button>
              </div>
            </details>
          </div> : null}
        </div>
        {exportMessage ? <div className="sql-export-feedback" role="status">{exportMessage}</div> : null}
        {error ? <div className="sql-result-message error"><strong>Erro ao executar SQL</strong><pre>{error}</pre></div> : result ? hasTabularResult && activeResult ? resultView === "table" ? <div className="sql-result-grid"><table><thead><tr>{activeResult.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{activeResult.rows.map((row, rowIndex) => <tr key={rowIndex}>{activeResult.columns.map((column) => { const value = formatCell(row[column]); return <td key={column} className={value === "NULL" ? "null" : ""} title={value}>{value}</td>; })}</tr>)}</tbody></table></div> : <pre className="sql-result-json">{serializeSqlResultAsJson(activeResult)}</pre> : <div className="sql-result-message success"><strong>Sucesso</strong><span>{activeResult?.rowCount && activeResult.rowCount > 0 ? `${activeResult.rowCount} linha(s) afetada(s).` : "Nenhuma linha retornada."}</span></div> : <div className="sql-result-empty"><SquareTerminal size={24}/><span>Execute uma consulta para visualizar o resultado.</span></div>}
      </section>
    </div>
  </section>;
}
