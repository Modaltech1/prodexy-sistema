import type { AttributeType, UserType } from "@aws-sdk/client-cognito-identity-provider";
import type { CognitoUserSummary } from "./contracts";

export function readCognitoAttribute(attributes: readonly AttributeType[] | undefined, name: string): string | null {
  return attributes?.find((attribute) => attribute.Name === name)?.Value ?? null;
}

export function mapCognitoUser(user: UserType): CognitoUserSummary {
  return {
    username: user.Username ?? "",
    email: readCognitoAttribute(user.Attributes, "email"),
    emailVerified: readCognitoAttribute(user.Attributes, "email_verified") === "true",
    status: user.UserStatus ?? "UNKNOWN",
    enabled: user.Enabled !== false,
    createdAt: user.UserCreateDate?.toISOString() ?? null,
    lastModifiedAt: user.UserLastModifiedDate?.toISOString() ?? null,
  };
}

export function matchesCognitoUser(user: CognitoUserSummary, search: string): boolean {
  const query = search.trim().toLocaleLowerCase("pt-BR");
  if (!query) return true;
  return [user.username, user.email ?? "", user.status]
    .some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
}

