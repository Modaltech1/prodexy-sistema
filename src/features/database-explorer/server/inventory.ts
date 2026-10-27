import "server-only";
import type { DatabaseInventoryResponse } from "../contracts";
import { getRegisteredDatabaseProjects } from "../registry";

export function getDatabaseInventory(): DatabaseInventoryResponse {
  return getRegisteredDatabaseProjects();
}
