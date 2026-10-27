import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { assembleCatalog, catalogQueries } from "../catalog";
import { buildDataQuery, type DataQueryInput } from "../data-query";
import { getTableDataPolicy } from "../data-policy";
import type { DatabaseCatalog, DatabaseRows } from "../contracts";

type ServerIntegration = {
  projectId: string;
  host: string;
  database: string;
  user: string;
  passwordReference: string;
};

const integrations: Record<string, ServerIntegration> = {
  "ph-outlet": {
    projectId: "ph-outlet",
    host: "db01.prodexylabs.com",
    database: "prodexy_ph_outlet",
    user: "prodexy_sistema_sql_executor",
    passwordReference: "PRODEXY_SISTEMA_SQL_EXECUTOR_DB_PASSWORD",
  },
};

const poolStore = globalThis as typeof globalThis & { prodexyDatabaseExplorerPools?: Map<string, Pool> };

function getIntegration(projectId: string) {
  return integrations[projectId] ?? null;
}

export function isDatabaseExplorerConfigured(projectId: string) {
  const integration = getIntegration(projectId);
  return Boolean(integration && process.env[integration.passwordReference]);
}

function getPool(integration: ServerIntegration): Pool {
  const password = process.env[integration.passwordReference];
  if (!password) throw new Error("DATABASE_EXPLORER_NOT_CONFIGURED");
  const pools = poolStore.prodexyDatabaseExplorerPools ?? new Map<string, Pool>();
  poolStore.prodexyDatabaseExplorerPools = pools;
  let pool = pools.get(integration.projectId);
  if (!pool) {
    pool = new Pool({
      host: integration.host,
      port: 5432,
      database: integration.database,
      user: integration.user,
      password,
      ssl: { rejectUnauthorized: true, servername: integration.host },
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: 6_000,
      statement_timeout: 5_000,
      application_name: "prodexy-sistema-db-explorer",
      options: "-c default_transaction_read_only=on",
    });
    pool.on("error", () => {
      // Idle socket failure: the next request reports an unavailable database.
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    pools.set(integration.projectId, pool);
  }
  return pool;
}

export async function readDatabaseCatalog(projectId: string): Promise<DatabaseCatalog | null> {
  const integration = getIntegration(projectId);
  if (!integration) return null;
  const client = await getPool(integration).connect();
  try {
    const tables = await client.query(catalogQueries.tables);
    const summary = await client.query(catalogQueries.summary);
    const columns = await client.query(catalogQueries.columns);
    const indexes = await client.query(catalogQueries.indexes);
    const constraints = await client.query(catalogQueries.constraints);
    const migrations = await client.query(catalogQueries.migrations);
    return assembleCatalog(projectId, integration.database, {
      tables: tables.rows,
      summary: summary.rows,
      columns: columns.rows,
      indexes: indexes.rows,
      constraints: constraints.rows,
      migrations: migrations.rows,
    });
  } finally {
    client.release();
  }
}

export async function readDatabaseTableRows(projectId: string, schema: string, table: string, input: DataQueryInput): Promise<DatabaseRows | null> {
  const integration = getIntegration(projectId);
  if (!integration) return null;
  const policy = getTableDataPolicy(projectId, schema, table);
  if (!policy) return null;
  const query = buildDataQuery(policy, input);
  const client = await getPool(integration).connect();
  try {
    const result = await client.query(query.text, query.values);
    const hasNext = result.rows.length > query.pageSize;
    return {
      projectId,
      databaseName: integration.database,
      schema,
      table,
      columns: [...policy.columns],
      rows: result.rows.slice(0, query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      hasNext,
      sort: query.sort,
      direction: query.direction,
      search: query.search,
      filterColumn: query.filterColumn,
      filterOperator: query.filterOperator,
    };
  } finally {
    client.release();
  }
}
