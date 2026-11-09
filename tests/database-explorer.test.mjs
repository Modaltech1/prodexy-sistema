import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getRegisteredDatabaseProject, getRegisteredDatabaseProjects } from "../src/features/database-explorer/registry.ts";
import { assembleCatalog, catalogQueries } from "../src/features/database-explorer/catalog.ts";
import { buildDataQuery } from "../src/features/database-explorer/data-query.ts";
import { getTableDataPolicy } from "../src/features/database-explorer/data-policy.ts";
import { getPrimarySqlResult, serializeSqlResultAsCsv, serializeSqlResultAsJson, serializeSqlResultAsMarkdown } from "../src/features/database-explorer/sql-editor.ts";
import { buildDeleteRowsQuery } from "../src/features/database-explorer/row-actions.ts";

test("registra os databases AWS sem fingir que já estão conectados", () => {
  const { projects } = getRegisteredDatabaseProjects();
  assert.deepEqual(projects.map((project) => project.id), ["ph-outlet", "oficina-mais"]);
  assert.equal(projects[0].databaseName, "prodexy_ph_outlet");
  assert.equal(projects[1].databaseName, "prodexy_oficina_mais");
  assert.equal(projects[1].nodeName, "prodexy-prod-db-node-02");
  for (const project of projects) {
    assert.equal(project.connectionState, "pending");
    assert.equal(project.tableCount, null);
  }
});

test("não compartilha objetos mutáveis do inventário entre requisições", () => {
  const first = getRegisteredDatabaseProjects();
  first.projects[0].projectName = "alterado";
  const second = getRegisteredDatabaseProjects();
  assert.equal(second.projects[0].projectName, "PH Outlet");
});

test("lookup explícito não conecta projeto desconhecido e devolve cópia", () => {
  assert.equal(getRegisteredDatabaseProject("inexistente"), null);
  const first = getRegisteredDatabaseProject("ph-outlet");
  assert.ok(first);
  first.projectName = "alterado";
  assert.equal(getRegisteredDatabaseProject("ph-outlet")?.projectName, "PH Outlet");
  assert.equal(getRegisteredDatabaseProject("oficina-mais")?.projectName, "Oficina Mais");
});

test("inventário público não contém campos de credencial", () => {
  const serialized = JSON.stringify(getRegisteredDatabaseProjects());
  assert.doesNotMatch(serialized, /password|secret|token|connectionString|databaseUrl/i);
});

test("monta estrutura e migrations sem ler linhas de negócio", () => {
  const catalog = assembleCatalog("ph-outlet", "prodexy_ph_outlet", {
    tables: [{ schema: "public", name: "lojas", kind: "table", estimated_rows: "2", data_bytes: "8192", total_bytes: "24576" }],
    summary: [{ database_bytes: "90000" }],
    columns: [{ schema: "public", table_name: "lojas", name: "id", data_type: "uuid", nullable: false, identity: false }],
    indexes: [{ schema: "public", table_name: "lojas", name: "lojas_pkey", unique: true, primary: true }],
    constraints: [{ schema: "public", table_name: "lojas", name: "lojas_pkey", type: "p", definition: "PRIMARY KEY (id)" }],
    migrations: [{ version: "202610140001_inicial", applied_at: new Date("2026-10-14T00:00:00.000Z") }],
  });
  assert.equal(catalog.tables[0].columns[0].name, "id");
  assert.equal(catalog.tables[0].indexes[0].primary, true);
  assert.equal(catalog.tables[0].constraints[0].definition, "PRIMARY KEY (id)");
  assert.equal(catalog.migrations[0].version, "202610140001_inicial");
  assert.equal(catalog.databaseBytes, 90000);
  assert.equal(catalog.tables[0].estimatedRows, 2);
  assert.equal(catalog.tables[0].totalBytes, 24576);
  assert.equal("rows" in catalog.tables[0], false);
});

test("política de dados exclui identidade Cognito e campos operacionais sensíveis", () => {
  const users = getTableDataPolicy("ph-outlet", "public", "usuarios");
  const sales = getTableDataPolicy("ph-outlet", "public", "vendas");
  assert.ok(users);
  assert.ok(sales);
  assert.equal(users.columns.includes("sub_cognito"), false);
  assert.equal(users.columns.includes("emissor_cognito"), false);
  assert.equal(sales.columns.includes("chave_idempotencia"), false);
  assert.equal(sales.columns.includes("impressao_requisicao"), false);
  assert.equal(getTableDataPolicy("ph-outlet", "private", "usuarios"), null);
  assert.equal(getTableDataPolicy("outro", "public", "usuarios"), null);
  assert.equal(getTableDataPolicy("ph-outlet", "public", "metas")?.columns.length, 12);
  assert.equal(getTableDataPolicy("ph-outlet", "public", "historico_metas")?.columns.length, 12);
});

test("consulta de linhas limita página e não interpola entrada do browser", () => {
  const policy = getTableDataPolicy("ph-outlet", "public", "categorias");
  assert.ok(policy);
  const query = buildDataQuery(policy, {
    page: "999999",
    pageSize: "999999",
    sort: 'nome"; DROP TABLE categorias; --',
    direction: "desc; DROP",
    search: "polo%' OR true --",
    filterColumn: 'nome"; DROP TABLE categorias; --',
    filterOperator: "equals; DROP",
  });
  assert.equal(query.page, 400);
  assert.equal(query.pageSize, 100);
  assert.equal(query.sort, "codigo");
  assert.equal(query.direction, "asc");
  assert.equal(query.filterColumn, null);
  assert.equal(query.filterOperator, "contains");
  assert.doesNotMatch(query.text, /DROP|polo|true/i);
  assert.match(query.text, /LIMIT \$2 OFFSET \$3$/);
  assert.equal(query.values[0], "%polo!%' OR true --%");
  assert.equal(query.values[1], 101);
  assert.equal(query.values[2], 39900);
});

test("filtro estruturado aceita somente coluna liberada e operador conhecido", () => {
  const policy = getTableDataPolicy("ph-outlet", "public", "usuarios");
  assert.ok(policy);
  const query = buildDataQuery(policy, { search: "Administrador", filterColumn: "nome_exibicao", filterOperator: "equals" });
  assert.match(query.text, /WHERE "nome_exibicao"::text = \$1/);
  assert.equal(query.values[0], "Administrador");
  assert.equal(query.filterColumn, "nome_exibicao");
  assert.equal(query.filterOperator, "equals");

  const blocked = buildDataQuery(policy, { search: "abc", filterColumn: "sub_cognito", filterOperator: "equals" });
  assert.equal(blocked.filterColumn, null);
  assert.doesNotMatch(blocked.text, /sub_cognito/);
});

test("exclusão usa somente as chaves declaradas e parâmetros SQL", () => {
  const policy = getTableDataPolicy("ph-outlet", "public", "usuarios_lojas");
  assert.ok(policy);
  const query = buildDeleteRowsQuery(policy, [
    { usuario_id: "user-1", loja_id: "loja-1", ativo: true },
    { usuario_id: "user-2", loja_id: "loja-2", ativo: false },
  ]);
  assert.equal(query.text, 'DELETE FROM "public"."usuarios_lojas" WHERE ("usuario_id" = $1 AND "loja_id" = $2) OR ("usuario_id" = $3 AND "loja_id" = $4) RETURNING "usuario_id", "loja_id"');
  assert.deepEqual(query.values, ["user-1", "loja-1", "user-2", "loja-2"]);
  assert.doesNotMatch(query.text, /ativo/);
});

test("exclusão bloqueia tabela de migrations e identidade incompleta", () => {
  const migrations = getTableDataPolicy("ph-outlet", "public", "migracoes_schema");
  const links = getTableDataPolicy("ph-outlet", "public", "usuarios_lojas");
  assert.ok(migrations);
  assert.ok(links);
  assert.throws(() => buildDeleteRowsQuery(migrations, [{ versao: "2026" }]), /DELETE_NOT_ALLOWED/);
  assert.throws(() => buildDeleteRowsQuery(links, [{ usuario_id: "user-1" }]), /INVALID_ROW_IDENTITY/);
});

test("consultas do catálogo são fixas e não incluem dados de negócio", () => {
  for (const [name, query] of Object.entries(catalogQueries)) {
    assert.match(query.trim(), /^SELECT\b/i, name);
    if (name !== "migrations") assert.match(query, /pg_catalog\./);
    assert.doesNotMatch(query, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
  }
});

test("catálogo aceita os dois nomes históricos da data de migration", () => {
  assert.match(catalogQueries.migrations, /to_jsonb\(migration\) ->> 'aplicada_em'/);
  assert.match(catalogQueries.migrations, /to_jsonb\(migration\) ->> 'aplicado_em'/);
  assert.doesNotMatch(catalogQueries.migrations, /ORDER BY aplicada_em/);
});

test("SQL Editor exibe o último resultado tabular sem abas por comando", () => {
  const command = { command: "CREATE", rowCount: null, columns: [], rows: [] };
  const rows = { command: "SELECT", rowCount: 1, columns: ["id", "dados"], rows: [{ id: 1, dados: { ativo: true } }] };
  assert.equal(getPrimarySqlResult([command, rows, { ...command, command: "COMMIT" }]), rows);
  assert.equal(getPrimarySqlResult([command])?.command, "CREATE");
});

test("SQL Editor exporta o resultado em JSON, CSV e Markdown", () => {
  const result = {
    command: "SELECT",
    rowCount: 2,
    columns: ["nome", "observacao"],
    rows: [
      { nome: "Oficina, Mais", observacao: "linha 1\nlinha 2" },
      { nome: "PH Outlet", observacao: null },
    ],
  };
  assert.equal(serializeSqlResultAsJson(result), JSON.stringify(result.rows, null, 2));
  assert.equal(serializeSqlResultAsCsv(result), 'nome,observacao\n"Oficina, Mais","linha 1\nlinha 2"\nPH Outlet,');
  assert.equal(serializeSqlResultAsMarkdown(result), "| nome | observacao |\n| --- | --- |\n| Oficina, Mais | linha 1<br>linha 2 |\n| PH Outlet |  |");
});

test("SQL Editor exige seleção explícita e confere o database retornado pelo servidor", () => {
  const page = readFileSync(new URL("../src/app/infraestrutura/sql/page.tsx", import.meta.url), "utf8");
  const executor = readFileSync(new URL("../src/features/database-explorer/server/sql-executor.ts", import.meta.url), "utf8");
  assert.match(page, /useState\(""\)/);
  assert.match(page, /Selecione o cliente e o database/);
  assert.match(page, /response\.databaseName !== selected\.databaseName/);
  assert.doesNotMatch(page, /\?\? projects\[0\]/);
  assert.match(executor, /SELECT current_database\(\) AS database_name/);
  assert.match(executor, /databaseName !== integration\.database/);
});
