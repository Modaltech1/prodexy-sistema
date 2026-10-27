import type { DatabaseCatalog, DatabaseTable } from "./contracts";

type Row = Record<string, unknown>;

export const catalogQueries = {
  tables: `
    SELECT n.nspname AS schema, c.relname AS name,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
      END AS kind,
      GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
      pg_catalog.pg_relation_size(c.oid) AS data_bytes,
      pg_catalog.pg_total_relation_size(c.oid) AS total_bytes
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY n.nspname, c.relname`,
  summary: `SELECT pg_catalog.pg_database_size(current_database()) AS database_bytes`,
  columns: `
    SELECT n.nspname AS schema, c.relname AS table_name,
      a.attname AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
      NOT a.attnotnull AS nullable, a.attidentity <> '' AS identity
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY n.nspname, c.relname, a.attnum`,
  indexes: `
    SELECT n.nspname AS schema, c.relname AS table_name,
      ic.relname AS name, i.indisunique AS unique, i.indisprimary AS primary
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
    JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY n.nspname, c.relname, ic.relname`,
  constraints: `
    SELECT n.nspname AS schema, c.relname AS table_name,
      con.conname AS name, con.contype AS type,
      pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY n.nspname, c.relname, con.conname`,
  migrations: `
    SELECT versao AS version, aplicada_em AS applied_at
    FROM public.migracoes_schema
    ORDER BY aplicada_em DESC, versao DESC
    LIMIT 50`,
} as const;

export function assembleCatalog(projectId: string, databaseName: string, rows: {
  tables: Row[];
  summary?: Row[];
  columns: Row[];
  indexes: Row[];
  constraints: Row[];
  migrations: Row[];
}): DatabaseCatalog {
  const tables: DatabaseTable[] = rows.tables.map((row) => ({
    schema: String(row.schema),
    name: String(row.name),
    kind: row.kind as DatabaseTable["kind"],
    estimatedRows: finiteNumber(row.estimated_rows),
    dataBytes: finiteNumber(row.data_bytes),
    totalBytes: finiteNumber(row.total_bytes),
    columns: [],
    indexes: [],
    constraints: [],
  }));
  const byName = new Map(tables.map((table) => [`${table.schema}.${table.name}`, table]));
  for (const row of rows.columns) {
    byName.get(`${row.schema}.${row.table_name}`)?.columns.push({
      name: String(row.name),
      dataType: String(row.data_type),
      nullable: Boolean(row.nullable),
      identity: Boolean(row.identity),
    });
  }
  for (const row of rows.indexes) {
    byName.get(`${row.schema}.${row.table_name}`)?.indexes.push({
      name: String(row.name),
      unique: Boolean(row.unique),
      primary: Boolean(row.primary),
    });
  }
  for (const row of rows.constraints) {
    byName.get(`${row.schema}.${row.table_name}`)?.constraints.push({
      name: String(row.name),
      type: String(row.type),
      definition: String(row.definition),
    });
  }
  return {
    projectId,
    databaseName,
    databaseBytes: finiteNumber(rows.summary?.[0]?.database_bytes),
    tables,
    migrations: rows.migrations.map((row) => ({
      version: String(row.version),
      appliedAt: new Date(row.applied_at as string | Date).toISOString(),
    })),
  };
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
