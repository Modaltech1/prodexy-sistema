"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Columns3, Database, Info, LockKeyhole, Search, Table2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import type { DatabaseCatalog, DatabaseInventoryResponse, DatabaseProject, DatabaseRows, DatabaseTable } from "@/features/database-explorer/contracts";

type ExplorerTab = "data" | "structure";

function connectionLabel(project: DatabaseProject) {
  if (project.connectionState === "connected") return "Conectado";
  if (project.connectionState === "unavailable") return "Indisponível";
  return "Acesso de leitura pendente";
}

function TableStructure({ table }: { table: DatabaseTable }) {
  return <>
    <div className="dbx-section-heading">Colunas</div>
    <div className="dbx-definition-table" role="table" aria-label="Colunas da tabela">
      <div className="dbx-definition-row head" role="row"><span>Nome</span><span>Tipo</span><span>Obrigatória</span></div>
      {table.columns.map((column) => <div key={column.name} className="dbx-definition-row" role="row"><strong>{column.name}</strong><code>{column.dataType}</code><span>{column.nullable ? "Não" : "Sim"}{column.identity ? " · identidade" : ""}</span></div>)}
    </div>
    <div className="dbx-structure-grids">
      <section><div className="dbx-section-heading">Índices <span>{table.indexes.length}</span></div>{table.indexes.length ? table.indexes.map((index) => <div className="dbx-meta-row" key={index.name}><strong>{index.name}</strong><small>{index.primary ? "Primária" : index.unique ? "Único" : "Índice"}</small></div>) : <p>Nenhum índice.</p>}</section>
      <section><div className="dbx-section-heading">Restrições <span>{table.constraints.length}</span></div>{table.constraints.length ? table.constraints.map((constraint) => <div className="dbx-meta-row" key={constraint.name}><strong>{constraint.name}</strong><small>{constraint.definition}</small></div>) : <p>Nenhuma restrição.</p>}</section>
    </div>
  </>;
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function TableData({ data, loading, error, searchDraft, filterColumn, filterOperator, onSearchDraft, onFilterColumn, onFilterOperator, onSearch, onPage, onSort }: {
  data: DatabaseRows | null;
  loading: boolean;
  error: string | null;
  searchDraft: string;
  filterColumn: string;
  filterOperator: "contains" | "equals";
  onSearchDraft: (value: string) => void;
  onFilterColumn: (value: string) => void;
  onFilterOperator: (value: "contains" | "equals") => void;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
  onSort: (column: string) => void;
}) {
  return <div className="dbx-data-view">
    <form className="dbx-data-toolbar" onSubmit={(event) => { event.preventDefault(); onSearch(searchDraft); }}><div className="dbx-filter-builder"><select aria-label="Coluna do filtro" value={filterColumn} onChange={(event) => onFilterColumn(event.target.value)}><option value="">Campos pesquisáveis</option>{data?.columns.map((column) => <option value={column} key={column}>{column}</option>)}</select><select aria-label="Operador do filtro" value={filterOperator} onChange={(event) => onFilterOperator(event.target.value as "contains" | "equals")}><option value="contains">contém</option><option value="equals">é igual a</option></select><label><Search size={15}/><span className="sr-only">Valor do filtro</span><input value={searchDraft} onChange={(event) => onSearchDraft(event.target.value)} placeholder="Digite um valor" maxLength={100}/></label></div><button type="submit">Aplicar</button>{searchDraft ? <button type="button" className="secondary" onClick={() => { onSearchDraft(""); onSearch(""); }}>Limpar</button> : null}<span>{data ? `${data.rows.length} linhas nesta página` : ""}</span></form>
    {loading ? <div className="dbx-data-state">Consultando linhas…</div> : error ? <div className="dbx-data-state error" role="alert"><LockKeyhole size={18}/><strong>{error}</strong><span>A estrutura continua disponível. Nenhuma permissão foi ampliada pela interface.</span></div> : data ? <>
      <div className="dbx-data-grid"><table><thead><tr>{data.columns.map((column) => <th key={column}><button type="button" onClick={() => onSort(column)}>{column}{data.sort === column ? <span>{data.direction === "asc" ? "↑" : "↓"}</span> : null}</button></th>)}</tr></thead><tbody>{data.rows.length ? data.rows.map((row, rowIndex) => <tr key={rowIndex}>{data.columns.map((column) => { const value = formatCell(row[column]); return <td key={column} className={value === "NULL" ? "null" : ""} title={value}>{value}</td>; })}</tr>) : <tr><td className="empty" colSpan={Math.max(data.columns.length, 1)}>Nenhuma linha encontrada.</td></tr>}</tbody></table></div>
      <div className="dbx-pagination"><button type="button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}><ArrowLeft size={14}/>Anterior</button><span>Página {data.page}</span><button type="button" disabled={!data.hasNext} onClick={() => onPage(data.page + 1)}>Próxima<ArrowRight size={14}/></button></div>
    </> : <div className="dbx-data-state">Selecione uma tabela para consultar.</div>}
  </div>;
}

export default function ProjectDatabasesPage() {
  const [inventory, setInventory] = useState<DatabaseInventoryResponse | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<DatabaseCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedId, setSelectedId] = useState("ph-outlet");
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [tab, setTab] = useState<ExplorerTab>("structure");
  const [rowData, setRowData] = useState<DatabaseRows | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [dataPage, setDataPage] = useState(1);
  const [dataSearchDraft, setDataSearchDraft] = useState("");
  const [dataSearch, setDataSearch] = useState("");
  const [dataSort, setDataSort] = useState("");
  const [dataDirection, setDataDirection] = useState<"asc" | "desc">("asc");
  const [dataFilterColumn, setDataFilterColumn] = useState("");
  const [dataFilterOperator, setDataFilterOperator] = useState<"contains" | "equals">("contains");

  useEffect(() => {
    let active = true;
    apiFetch<DatabaseInventoryResponse>("/api/infraestrutura/bancos")
      .then((result) => { if (active) { setInventory(result); setLoadingCatalog(true); } })
      .catch((cause: unknown) => { if (active) setInventoryError(cause instanceof Error ? cause.message : "Não foi possível carregar os bancos."); });
    return () => { active = false; };
  }, []);

  const hasSelectedProject = Boolean(inventory?.projects.some((project) => project.id === selectedId));

  useEffect(() => {
    if (!hasSelectedProject) return;
    let active = true;
    fetch(`/api/infraestrutura/bancos/${encodeURIComponent(selectedId)}/catalogo`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!active) return;
        if (!response.ok) {
          const state = payload.state === "pending" ? "pending" : "unavailable";
          setInventory((current) => current && ({ projects: current.projects.map((project) => project.id === selectedId ? { ...project, connectionState: state } : project) }));
          setCatalogError(String(payload.error || "Não foi possível consultar o banco."));
          return;
        }
        const next = payload.data as DatabaseCatalog;
        setCatalog(next);
        setSelectedTableName(next.tables[0] ? `${next.tables[0].schema}.${next.tables[0].name}` : null);
        setInventory((current) => current && ({ projects: current.projects.map((project) => project.id === selectedId ? { ...project, connectionState: "connected", tableCount: next.tables.length } : project) }));
      })
      .catch(() => { if (active) { setCatalogError("Não foi possível consultar o DB Node agora."); setInventory((current) => current && ({ projects: current.projects.map((project) => project.id === selectedId ? { ...project, connectionState: "unavailable" } : project) })); } })
      .finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, [hasSelectedProject, selectedId]);

  useEffect(() => {
    if (tab !== "data" || !selectedTableName) return;
    const [, table] = selectedTableName.split(".", 2);
    if (!table) return;
    let active = true;
    const params = new URLSearchParams({ page: String(dataPage), pageSize: "25" });
    if (dataSearch) params.set("q", dataSearch);
    if (dataSort) { params.set("sort", dataSort); params.set("direction", dataDirection); }
    if (dataFilterColumn) { params.set("column", dataFilterColumn); params.set("operator", dataFilterOperator); }
    apiFetch<DatabaseRows>(`/api/infraestrutura/bancos/${encodeURIComponent(selectedId)}/dados/${encodeURIComponent(table)}?${params}`)
      .then((response) => { if (active) setRowData(response); })
      .catch((cause: unknown) => { if (active) { setRowData(null); setRowError(cause instanceof Error ? cause.message : "Não foi possível consultar as linhas."); } })
      .finally(() => { if (active) setLoadingRows(false); });
    return () => { active = false; };
  }, [dataDirection, dataFilterColumn, dataFilterOperator, dataPage, dataSearch, dataSort, selectedId, selectedTableName, tab]);

  const projects = inventory?.projects ?? [];
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0];
  const activeCatalog = catalog?.projectId === selected?.id ? catalog : null;
  const visibleTables = activeCatalog?.tables.filter((table) => `${table.schema}.${table.name}`.toLocaleLowerCase("pt-BR").includes(tableSearch.trim().toLocaleLowerCase("pt-BR"))) ?? [];
  const selectedTable = activeCatalog?.tables.find((table) => `${table.schema}.${table.name}` === selectedTableName);

  function selectProject(projectId: string) {
    if (projectId === selectedId) return;
    setCatalog(null);
    setCatalogError(null);
    setSelectedTableName(null);
    setLoadingCatalog(true);
    setSelectedId(projectId);
    setTab("structure");
    setTableSearch("");
    resetDataView();
  }

  function resetDataView() {
    setRowData(null);
    setRowError(null);
    setDataPage(1);
    setDataSearchDraft("");
    setDataSearch("");
    setDataSort("");
    setDataDirection("asc");
    setDataFilterColumn("");
    setDataFilterOperator("contains");
  }

  function sortRows(column: string) {
    setLoadingRows(true);
    setRowError(null);
    setDataPage(1);
    const currentSort = rowData?.sort ?? dataSort;
    const currentDirection = rowData?.direction ?? dataDirection;
    if (currentSort === column) { setDataSort(column); setDataDirection(currentDirection === "asc" ? "desc" : "asc"); }
    else { setDataSort(column); setDataDirection("asc"); }
  }

  function searchRows(value: string) {
    setLoadingRows(true);
    setRowError(null);
    setDataPage(1);
    setDataSearch(value.trim());
  }

  function changeDataPage(page: number) {
    setLoadingRows(true);
    setRowError(null);
    setDataPage(page);
  }

  function changeFilterColumn(column: string) {
    if (dataSearch) setLoadingRows(true);
    setDataPage(1);
    setDataFilterColumn(column);
  }

  function changeFilterOperator(operator: "contains" | "equals") {
    if (dataSearch) setLoadingRows(true);
    setDataPage(1);
    setDataFilterOperator(operator);
  }

  return <>
    {inventoryError ? <div className="error-box" role="alert">{inventoryError}</div> : null}
    <section className="dbx-workspace dbx-workspace--focused" aria-label="Explorador de bancos">
      <div className="dbx-main">
        {selected ? <>
          <header className="dbx-database-toolbar">
            <label className="dbx-project-picker"><Database size={17} aria-hidden="true"/><span className="sr-only">Projeto e database</span><select value={selected.id} onChange={(event) => selectProject(event.target.value)} aria-label="Projeto e database">{projects.map((project) => <option key={project.id} value={project.id}>{project.projectName} — {project.databaseName}</option>)}</select></label>
            <div className="dbx-database-context"><span>{selected.provider}</span><i aria-hidden="true"/><span>{selected.nodeName}</span>{activeCatalog ? <><i aria-hidden="true"/><span>{formatBytes(activeCatalog.databaseBytes)}</span></> : null}</div>
            <div className="dbx-database-state"><span className={`dbx-connection ${selected.connectionState}`}>{loadingCatalog ? "Consultando…" : connectionLabel(selected)}</span><span className="dbx-readonly"><LockKeyhole size={13}/>Somente leitura</span></div>
          </header>
          {activeCatalog ? <div className="dbx-database-body"><aside className="dbx-table-sidebar" aria-label="Tabelas do banco"><div className="dbx-table-sidebar-heading"><strong>Tabelas</strong><span>{activeCatalog.tables.length}</span></div><label className="dbx-table-search"><Search size={15}/><span className="sr-only">Buscar tabela</span><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Buscar tabela"/></label><div className="dbx-table-list">{visibleTables.map((table) => <button key={`${table.schema}.${table.name}`} type="button" className={`dbx-table-item ${selectedTableName === `${table.schema}.${table.name}` ? "active" : ""}`} onClick={() => { setSelectedTableName(`${table.schema}.${table.name}`); setTab("structure"); resetDataView(); }}><Table2 size={15}/><span>{table.name}</span><small>{table.columns.length}</small></button>)}{visibleTables.length === 0 ? <p>Nenhuma tabela encontrada.</p> : null}</div><details className="dbx-migrations"><summary>Migrations <span>{activeCatalog.migrations.length}</span></summary><div className="dbx-migration-list">{activeCatalog.migrations.length ? activeCatalog.migrations.map((migration) => <div key={migration.version}><span>{migration.version}</span><small>{new Date(migration.appliedAt).toLocaleDateString("pt-BR")}</small></div>) : <p>Nenhuma registrada.</p>}</div></details></aside>
            <div className="dbx-detail" role="tabpanel">{selectedTable ? <><div className="dbx-detail-heading"><div><span>{selectedTable.schema} / {selectedTable.kind === "view" ? "View" : "Tabela"}</span><h3>{selectedTable.name}</h3></div><div className="dbx-detail-controls"><small>{selectedTable.columns.length} colunas · {formatBytes(selectedTable.totalBytes)} · ~{selectedTable.estimatedRows ?? "—"} linhas</small><div className="dbx-tabs" role="tablist" aria-label="Visualização da tabela"><button type="button" role="tab" aria-selected={tab === "data"} className={tab === "data" ? "active" : ""} onClick={() => { if (tab !== "data") { setLoadingRows(true); setRowError(null); setTab("data"); } }}><Table2 size={15}/>Dados</button><button type="button" role="tab" aria-selected={tab === "structure"} className={tab === "structure" ? "active" : ""} onClick={() => setTab("structure")}><Columns3 size={15}/>Estrutura</button></div></div></div>{tab === "structure" ? <TableStructure table={selectedTable}/> : <TableData data={rowData} loading={loadingRows} error={rowError} searchDraft={dataSearchDraft} filterColumn={dataFilterColumn} filterOperator={dataFilterOperator} onSearchDraft={setDataSearchDraft} onFilterColumn={changeFilterColumn} onFilterOperator={changeFilterOperator} onSearch={searchRows} onPage={changeDataPage} onSort={sortRows}/>}</> : <div className="dbx-empty"><div className="dbx-empty-icon"><Table2 size={28}/></div><h3>Selecione uma tabela</h3><p>As tabelas disponíveis aparecem na lista ao lado.</p></div>}</div>
          </div> : <div className="dbx-empty" role="tabpanel"><div className="dbx-empty-icon">{loadingCatalog ? <Database size={28}/> : <Info size={28}/>}</div><h3>{loadingCatalog ? "Consultando estrutura…" : "Estrutura ainda indisponível"}</h3><p>{catalogError || "A credencial administrativa do banco ainda não foi configurada. Nenhuma tabela foi consultada."}</p>{!loadingCatalog ? <div className="dbx-empty-note"><Info size={17} aria-hidden="true"/>O explorador reutiliza a conexão administrativa da plataforma, sempre em sessão somente leitura.</div> : null}</div>}
        </> : <div className="dbx-empty"><div className="dbx-empty-icon"><Database size={28}/></div><h3>Selecione um projeto</h3><p>O inventário aparecerá aqui quando estiver disponível.</p></div>}
      </div>
    </section>
  </>;
}
