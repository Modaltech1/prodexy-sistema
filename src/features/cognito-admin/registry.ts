import { getRegisteredDatabaseProject } from "../database-explorer/registry.ts";
import type { CognitoAdminTarget } from "./contracts";

const registrations = [
  {
    projectId: "ph-outlet",
    poolId: "us-east-1_Jm4EQEGdZ",
    poolName: "prodexy-prod-dedicated-users",
    poolScope: "shared-dedicated" as const,
  },
  {
    projectId: "oficina-mais",
    poolId: "us-east-1_liWyXLiqZ",
    poolName: "prodexy-prod-oficina-mais-users",
    poolScope: "product" as const,
  },
] as const;

export function getCognitoAdminTargets(): CognitoAdminTarget[] {
  return registrations.flatMap((registration) => {
    const project = getRegisteredDatabaseProject(registration.projectId);
    if (!project) return [];
    return [{
      id: project.id,
      projectName: project.projectName,
      databaseName: project.databaseName,
      nodeName: project.nodeName,
      poolId: registration.poolId,
      poolName: registration.poolName,
      poolScope: registration.poolScope,
    }];
  });
}

export function getCognitoAdminTarget(targetId: string): CognitoAdminTarget | null {
  return getCognitoAdminTargets().find((target) => target.id === targetId) ?? null;
}
