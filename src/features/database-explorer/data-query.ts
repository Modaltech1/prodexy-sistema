import type { TableDataPolicy } from "./data-policy";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 400;
const MAX_SEARCH_LENGTH = 100;

export type DataQueryInput = {
  page?: string | null;
  pageSize?: string | null;
  sort?: string | null;
  direction?: string | null;
  search?: string | null;
  filterColumn?: string | null;
  filterOperator?: string | null;
};

export type BuiltDataQuery = {
  text: string;
  values: unknown[];
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  search: string;
  filterColumn: string | null;
  filterOperator: "contains" | "equals";
};

export function buildDataQuery(policy: TableDataPolicy, input: DataQueryInput): BuiltDataQuery {
  const page = boundedInteger(input.page, 1, MAX_PAGE, 1);
  const pageSize = boundedInteger(input.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const sort = input.sort && policy.columns.includes(input.sort) ? input.sort : policy.defaultSort;
  const direction = input.direction === "desc" || input.direction === "asc" ? input.direction : policy.defaultDirection;
  const search = String(input.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  const filterColumn = input.filterColumn && policy.columns.includes(input.filterColumn) ? input.filterColumn : null;
  const filterOperator = input.filterOperator === "equals" ? "equals" : "contains";
  const values: unknown[] = [];
  let where = "";

  if (search && filterColumn) {
    values.push(filterOperator === "equals" ? search : `%${escapeLike(search)}%`);
    where = filterOperator === "equals"
      ? ` WHERE ${quoteIdentifier(filterColumn)}::text = $1`
      : ` WHERE ${quoteIdentifier(filterColumn)}::text ILIKE $1 ESCAPE '!'`;
  } else if (search && policy.searchableColumns.length) {
    values.push(`%${escapeLike(search)}%`);
    where = ` WHERE (${policy.searchableColumns.map((column) => `${quoteIdentifier(column)}::text ILIKE $1 ESCAPE '!'`).join(" OR ")})`;
  }

  values.push(pageSize + 1, (page - 1) * pageSize);
  const limitParameter = values.length - 1;
  const offsetParameter = values.length;
  const columns = policy.columns.map(quoteIdentifier).join(", ");
  const text = `SELECT ${columns} FROM ${quoteIdentifier(policy.schema)}.${quoteIdentifier(policy.table)}${where} ORDER BY ${quoteIdentifier(sort)} ${direction.toUpperCase()} NULLS LAST LIMIT $${limitParameter} OFFSET $${offsetParameter}`;

  return { text, values, page, pageSize, sort, direction, search, filterColumn, filterOperator };
}

function boundedInteger(value: string | null | undefined, minimum: number, maximum: number, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function escapeLike(value: string) {
  return value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");
}
