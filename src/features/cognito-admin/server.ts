import "server-only";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  paginateListUserPools,
  paginateListUsers,
} from "@aws-sdk/client-cognito-identity-provider";
import type { CognitoAdminSnapshot, CognitoUserSummary } from "./contracts";
import { mapCognitoUser, matchesCognitoUser } from "./model";
import { getCognitoAdminTarget, getCognitoAdminTargets } from "./registry";

const regionReference = "PRODEXY_SISTEMA_COGNITO_REGION";
const accessKeyReference = "PRODEXY_SISTEMA_COGNITO_AWS_ACCESS_KEY_ID";
const secretKeyReference = "PRODEXY_SISTEMA_COGNITO_AWS_SECRET_ACCESS_KEY";

export class CognitoAdminConfigurationError extends Error {
  constructor() {
    super("Configure a credencial server-side do Authentication para consultar o Cognito.");
    this.name = "CognitoAdminConfigurationError";
  }
}

export function isCognitoAdminConfigured(): boolean {
  return Boolean(process.env[accessKeyReference] && process.env[secretKeyReference]);
}

function createCognitoClient() {
  const accessKeyId = process.env[accessKeyReference];
  const secretAccessKey = process.env[secretKeyReference];
  if (!accessKeyId || !secretAccessKey) throw new CognitoAdminConfigurationError();

  return new CognitoIdentityProviderClient({
    region: process.env[regionReference] || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 3,
  });
}

async function readPoolIds(client: CognitoIdentityProviderClient): Promise<Set<string>> {
  const poolIds = new Set<string>();
  for await (const page of paginateListUserPools({ client }, { MaxResults: 60 })) {
    for (const pool of page.UserPools ?? []) {
      if (pool.Id) poolIds.add(pool.Id);
    }
  }
  return poolIds;
}

async function assertAuthorizedTarget(client: CognitoIdentityProviderClient, targetId: string) {
  const target = getCognitoAdminTarget(targetId);
  if (!target) throw new Error("O projeto selecionado não pertence ao inventário autorizado.");
  const poolIds = await readPoolIds(client);
  if (!poolIds.has(target.poolId)) {
    throw new Error("O User Pool registrado para este projeto não está disponível.");
  }
  return target;
}

export async function readCognitoAdminSnapshot(selectedTargetId: string | null, search = ""): Promise<CognitoAdminSnapshot> {
  const targets = getCognitoAdminTargets();
  if (!isCognitoAdminConfigured()) {
    return { configured: false, targets, selectedTargetId, users: [] };
  }

  const client = createCognitoClient();
  if (!selectedTargetId) return { configured: true, targets, selectedTargetId: null, users: [] };
  const target = await assertAuthorizedTarget(client, selectedTargetId);

  const users: CognitoUserSummary[] = [];
  for await (const page of paginateListUsers({ client }, { UserPoolId: target.poolId, Limit: 60 })) {
    for (const user of page.Users ?? []) {
      const mapped = mapCognitoUser(user);
      if (mapped.username && matchesCognitoUser(mapped, search)) users.push(mapped);
      if (users.length >= 500) break;
    }
    if (users.length >= 500) break;
  }

  return { configured: true, targets, selectedTargetId, users };
}

export async function createCognitoUser(targetId: string, email: string) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  await client.send(new AdminCreateUserCommand({
    UserPoolId: target.poolId,
    Username: email,
    UserAttributes: [{ Name: "email", Value: email }],
    DesiredDeliveryMediums: ["EMAIL"],
  }));
}

export async function updateCognitoUserEmail(targetId: string, username: string, email: string) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  await client.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: target.poolId,
    Username: username,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "false" },
    ],
  }));
}

export async function setCognitoUserEnabled(targetId: string, username: string, enabled: boolean) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  const Command = enabled ? AdminEnableUserCommand : AdminDisableUserCommand;
  await client.send(new Command({ UserPoolId: target.poolId, Username: username }));
}

export async function setCognitoUserPassword(targetId: string, username: string, password: string, permanent: boolean) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  await client.send(new AdminSetUserPasswordCommand({ UserPoolId: target.poolId, Username: username, Password: password, Permanent: permanent }));
}

export async function resetCognitoUserPassword(targetId: string, username: string) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  await client.send(new AdminResetUserPasswordCommand({ UserPoolId: target.poolId, Username: username }));
}

export async function signOutCognitoUser(targetId: string, username: string) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  await client.send(new AdminUserGlobalSignOutCommand({ UserPoolId: target.poolId, Username: username }));
}

export async function deleteCognitoUser(targetId: string, username: string) {
  const client = createCognitoClient();
  const target = await assertAuthorizedTarget(client, targetId);
  await client.send(new AdminDeleteUserCommand({ UserPoolId: target.poolId, Username: username }));
}

