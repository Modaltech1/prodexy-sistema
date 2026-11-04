import type { TableDataPolicy } from "./data-policy";

const MAX_ROWS_PER_DELETE = 100;

export type RowIdentity = Record<string, unknown>;

export function buildDeleteRowsQuery(policy: TableDataPolicy, rows: readonly RowIdentity[]) {
  if (!policy.deleteEnabled) throw new Error("DELETE_NOT_ALLOWED");
  if (!rows.length || rows.length > MAX_ROWS_PER_DELETE) throw new Error("INVALID_DELETE_COUNT");

  const values: unknown[] = [];
  const predicates = rows.map((row) => {
    const parts = policy.keyColumns.map((column) => {
      if (!(column in row) || row[column] === null || row[column] === undefined) throw new Error("INVALID_ROW_IDENTITY");
      values.push(row[column]);
      return `${quoteIdentifier(column)} = $${values.length}`;
    });
    return `(${parts.join(" AND ")})`;
  });

  return {
    text: `DELETE FROM ${quoteIdentifier(policy.schema)}.${quoteIdentifier(policy.table)} WHERE ${predicates.join(" OR ")} RETURNING ${policy.keyColumns.map(quoteIdentifier).join(", ")}`,
    values,
  };
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
