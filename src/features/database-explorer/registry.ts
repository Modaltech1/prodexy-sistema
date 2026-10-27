import type { DatabaseInventoryResponse, DatabaseProject } from "./contracts";

// Este inventário é explícito: um projeto financeiro não passa a ter database
// consultável apenas porque existe na tabela `projects` do sistema.
const registeredProjects: readonly DatabaseProject[] = [
  {
    id: "ph-outlet",
    projectName: "PH Outlet",
    databaseName: "prodexy_ph_outlet",
    provider: "PostgreSQL AWS",
    nodeName: "prodexy-prod-db-node-01",
    connectionState: "pending",
    tableCount: null,
  },
];

export function getRegisteredDatabaseProjects(): DatabaseInventoryResponse {
  return { projects: registeredProjects.map((project) => ({ ...project })) };
}

export function getRegisteredDatabaseProject(projectId: string): DatabaseProject | null {
  const project = registeredProjects.find((item) => item.id === projectId);
  return project ? { ...project } : null;
}
