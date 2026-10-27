export function requiresSqlConfirmation(sql: string) {
  return !/^(select|show|explain)\b/i.test(sql.trim());
}
