import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, type QueryResult } from "pg";
import type { SqlExecutionResponse, SqlResultSet } from "../contracts";

type SqlIntegration = {
  projectId: string;
  host: string;
  database: string;
};

const integrations: Record<string, SqlIntegration> = {
  "ph-outlet": {
    projectId: "ph-outlet",
    host: "db01.prodexylabs.com",
    database: "prodexy_ph_outlet",
  },
};

const passwordReference = "PRODEXY_SISTEMA_SQL_EXECUTOR_DB_PASSWORD";
const executorUser = "prodexy_sistema_sql_executor";
const poolStore = globalThis as typeof globalThis & { prodexySqlExecutorPools?: Map<string, Pool> };

export function isSqlExecutorConfigured(projectId: string) {
  return Boolean(integrations[projectId] && process.env[passwordReference]);
}

function getPool(integration: SqlIntegration) {
  const password = process.env[passwordReference];
  if (!password) throw new Error("SQL_EXECUTOR_NOT_CONFIGURED");
  const pools = poolStore.prodexySqlExecutorPools ?? new Map<string, Pool>();
  poolStore.prodexySqlExecutorPools = pools;
  let pool = pools.get(integration.projectId);
  if (!pool) {
    pool = new Pool({
      host: integration.host,
      port: 5432,
      database: integration.database,
      user: executorUser,
      password,
      ssl: { rejectUnauthorized: true, servername: integration.host },
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
      application_name: "prodexy-sistema-sql-editor",
    });
    pool.on("error", () => {
      // A próxima execução informa a indisponibilidade ao usuário.
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    pools.set(integration.projectId, pool);
  }
  return pool;
}

function normalizeResult(result: QueryResult): SqlResultSet {
  return {
    command: result.command,
    rowCount: result.rowCount,
    columns: result.fields.map((field) => field.name),
    rows: result.rows as Record<string, unknown>[],
  };
}

export async function executeSql(projectId: string, sql: string): Promise<SqlExecutionResponse | null> {
  const integration = integrations[projectId];
  if (!integration) return null;
  const startedAt = performance.now();
  const result = await getPool(integration).query(sql);
  const resultSets = (Array.isArray(result) ? result : [result]).map(normalizeResult);
  return {
    projectId,
    databaseName: integration.database,
    durationMs: Math.round(performance.now() - startedAt),
    results: resultSets,
  };
}
