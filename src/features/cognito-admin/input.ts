export class CognitoAdminInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CognitoAdminInputError";
  }
}

type InputRecord = Record<string, unknown>;

export type CreateCognitoUserInput = { targetId: string; email: string };

export type PatchCognitoUserInput =
  | { action: "update-email"; targetId: string; username: string; email: string }
  | { action: "set-enabled"; targetId: string; username: string; enabled: boolean }
  | { action: "set-password"; targetId: string; username: string; password: string; permanent: boolean }
  | { action: "reset-password" | "sign-out"; targetId: string; username: string };

export type DeleteCognitoUserInput = { targetId: string; username: string };

function record(value: unknown): InputRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CognitoAdminInputError("Envie um objeto JSON válido.");
  }
  return value as InputRecord;
}

function requiredString(input: InputRecord, key: string, label: string, maxLength: number) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (!value) throw new CognitoAdminInputError(`Informe ${label}.`);
  if (value.length > maxLength) throw new CognitoAdminInputError(`${label} excede o limite permitido.`);
  return value;
}

function targetId(input: InputRecord) {
  const value = requiredString(input, "targetId", "o projeto", 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new CognitoAdminInputError("Projeto inválido.");
  return value;
}

function username(input: InputRecord) {
  return requiredString(input, "username", "o usuário", 128);
}

function email(input: InputRecord) {
  const value = requiredString(input, "email", "o e-mail", 320).toLocaleLowerCase("en-US");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new CognitoAdminInputError("Informe um e-mail válido.");
  return value;
}

export function parseCreateCognitoUserInput(value: unknown): CreateCognitoUserInput {
  const input = record(value);
  return { targetId: targetId(input), email: email(input) };
}

export function parsePatchCognitoUserInput(value: unknown): PatchCognitoUserInput {
  const input = record(value);
  const action = requiredString(input, "action", "a ação", 40);
  const base = { targetId: targetId(input), username: username(input) };

  if (action === "update-email") return { action, ...base, email: email(input) };
  if (action === "set-enabled") {
    if (typeof input.enabled !== "boolean") throw new CognitoAdminInputError("Informe o estado do usuário.");
    return { action, ...base, enabled: input.enabled };
  }
  if (action === "set-password") {
    const password = requiredString(input, "password", "a nova senha", 256);
    if (password.length < 8) throw new CognitoAdminInputError("A senha deve ter pelo menos 8 caracteres.");
    if (typeof input.permanent !== "boolean") throw new CognitoAdminInputError("Informe se a senha é permanente.");
    return { action, ...base, password, permanent: input.permanent };
  }
  if (action === "reset-password" || action === "sign-out") return { action, ...base };
  throw new CognitoAdminInputError("Ação administrativa inválida.");
}

export function parseDeleteCognitoUserInput(value: unknown): DeleteCognitoUserInput {
  const input = record(value);
  return { targetId: targetId(input), username: username(input) };
}

