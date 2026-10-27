export type DatabaseConnectionState = "pending" | "connected" | "unavailable";

export type DatabaseProject = {
  id: string;
  projectName: string;
  databaseName: string;
  provider: "PostgreSQL AWS";
  nodeName: string;
  connectionState: DatabaseConnectionState;
  tableCount: number | null;
};

export type DatabaseInventoryResponse = {
  projects: DatabaseProject[];
};

export type DatabaseColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  identity: boolean;
};

export type DatabaseIndex = {
  name: string;
  unique: boolean;
  primary: boolean;
};

export type DatabaseConstraint = {
  name: string;
  type: string;
  definition: string;
};

export type DatabaseTable = {
  schema: string;
  name: string;
  kind: "table" | "partitioned" | "view" | "materialized_view";
  estimatedRows: number | null;
  dataBytes: number | null;
  totalBytes: number | null;
  columns: DatabaseColumn[];
  indexes: DatabaseIndex[];
  constraints: DatabaseConstraint[];
};

export type DatabaseMigration = {
  version: string;
  appliedAt: string;
};

export type DatabaseCatalog = {
  projectId: string;
  databaseName: string;
  databaseBytes: number | null;
  tables: DatabaseTable[];
  migrations: DatabaseMigration[];
};

export type DatabaseRows = {
  projectId: string;
  databaseName: string;
  schema: string;
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  page: number;
  pageSize: number;
  hasNext: boolean;
  sort: string;
  direction: "asc" | "desc";
  search: string;
  filterColumn: string | null;
  filterOperator: "contains" | "equals";
};

export type SqlResultSet = {
  command: string;
  rowCount: number | null;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type SqlExecutionResponse = {
  projectId: string;
  databaseName: string;
  durationMs: number;
  results: SqlResultSet[];
};
