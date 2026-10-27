import assert from "node:assert/strict";
import test from "node:test";
import { getRegisteredDatabaseProject, getRegisteredDatabaseProjects } from "../src/features/database-explorer/registry.ts";
import { assembleCatalog, catalogQueries } from "../src/features/database-explorer/catalog.ts";
import { buildDataQuery } from "../src/features/database-explorer/data-query.ts";
import { getTableDataPolicy } from "../src/features/database-explorer/data-policy.ts";

test("registra PH sem fingir que o banco já está conectado", () => {
  const { projects } = getRegisteredDatabaseProjects();
  assert.deepEqual(projects.map((project) => project.id), ["ph-outlet"]);
  assert.equal(projects[0].databaseName, "prodexy_ph_outlet");
  assert.equal(projects[0].connectionState, "pending");
  assert.equal(projects[0].tableCount, null);
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

test("consultas do catálogo são fixas e não incluem dados de negócio", () => {
  for (const [name, query] of Object.entries(catalogQueries)) {
    assert.match(query.trim(), /^SELECT\b/i, name);
    if (name !== "migrations") assert.match(query, /pg_catalog\./);
    assert.doesNotMatch(query, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
  }
});
