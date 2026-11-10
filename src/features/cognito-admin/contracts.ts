export type CognitoAdminTarget = {
  id: string;
  projectName: string;
  databaseName: string;
  nodeName: string;
  poolId: string;
  poolName: string;
  poolScope: "shared-dedicated" | "product";
};

export type CognitoUserSummary = {
  username: string;
  email: string | null;
  emailVerified: boolean;
  status: string;
  enabled: boolean;
  createdAt: string | null;
  lastModifiedAt: string | null;
};

export type CognitoAdminSnapshot = {
  configured: boolean;
  targets: CognitoAdminTarget[];
  selectedTargetId: string | null;
  users: CognitoUserSummary[];
};

