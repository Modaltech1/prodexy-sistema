import type { SqlResultSet } from "./contracts";

function exportValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function getPrimarySqlResult(results: readonly SqlResultSet[]) {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index].columns.length > 0) return results[index];
  }
  return results.at(-1) ?? null;
}

export function serializeSqlResultAsJson(result: SqlResultSet) {
  return JSON.stringify(result.rows, null, 2);
}

export function serializeSqlResultAsCsv(result: SqlResultSet) {
  const escape = (value: unknown) => {
    const text = exportValue(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    result.columns.map(escape).join(","),
    ...result.rows.map((row) => result.columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
}

export function serializeSqlResultAsMarkdown(result: SqlResultSet) {
  const escape = (value: unknown) => exportValue(value)
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, "<br>");
  return [
    `| ${result.columns.map(escape).join(" | ")} |`,
    `| ${result.columns.map(() => "---").join(" | ")} |`,
    ...result.rows.map((row) => `| ${result.columns.map((column) => escape(row[column])).join(" | ")} |`),
  ].join("\n");
}
