import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/config";
import { AccessError, requireAdmin } from "@/lib/auth/access";
import {
  CognitoAdminConfigurationError,
  createCognitoUser,
  deleteCognitoUser,
  readCognitoAdminSnapshot,
  resetCognitoUserPassword,
  setCognitoUserEnabled,
  setCognitoUserPassword,
  signOutCognitoUser,
  updateCognitoUserEmail,
} from "@/features/cognito-admin/server";
import {
  CognitoAdminInputError,
  parseCreateCognitoUserInput,
  parseDeleteCognitoUserInput,
  parsePatchCognitoUserInput,
} from "@/features/cognito-admin/input";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

async function authorize() {
  if (!authEnabled) {
    throw new AccessError("Habilite o login administrativo antes de usar o Authentication.", 403);
  }
  await requireAdmin();
}

async function body(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    throw new CognitoAdminInputError("Envie um JSON válido.");
  }
}

function failure(error: unknown) {
  if (error instanceof AccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  }
  if (error instanceof CognitoAdminInputError) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: privateHeaders });
  }
  if (error instanceof CognitoAdminConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503, headers: privateHeaders });
  }

  const name = error instanceof Error ? error.name : "";
  const status = name === "UserNotFoundException" ? 404
    : name === "UsernameExistsException" ? 409
      : name === "TooManyRequestsException" ? 429
        : name === "InvalidParameterException" || name === "InvalidPasswordException" ? 400
          : 502;
  const message = name === "UserNotFoundException" ? "O usuário não foi encontrado."
    : name === "UsernameExistsException" ? "Já existe um usuário com este e-mail."
      : name === "TooManyRequestsException" ? "O Cognito limitou temporariamente as solicitações. Tente novamente."
        : name === "InvalidPasswordException" ? "A senha não atende à política do User Pool."
          : name === "InvalidParameterException" ? "O Cognito rejeitou os dados informados."
            : "Não foi possível concluir a operação no Cognito.";
  console.error("Falha na administração do Authentication Cognito.", { name, status });
  return NextResponse.json({ error: message }, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  try {
    await authorize();
    const url = new URL(request.url);
    const targetId = url.searchParams.get("targetId")?.trim() || null;
    const search = (url.searchParams.get("q") || "").slice(0, 100);
    const data = await readCognitoAdminSnapshot(targetId, search);
    return NextResponse.json({ data }, { headers: privateHeaders });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await authorize();
    const input = parseCreateCognitoUserInput(await body(request));
    await createCognitoUser(input.targetId, input.email);
    return NextResponse.json({ data: { created: true } }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await authorize();
    const input = parsePatchCognitoUserInput(await body(request));
    if (input.action === "update-email") await updateCognitoUserEmail(input.targetId, input.username, input.email);
    if (input.action === "set-enabled") await setCognitoUserEnabled(input.targetId, input.username, input.enabled);
    if (input.action === "set-password") await setCognitoUserPassword(input.targetId, input.username, input.password, input.permanent);
    if (input.action === "reset-password") await resetCognitoUserPassword(input.targetId, input.username);
    if (input.action === "sign-out") await signOutCognitoUser(input.targetId, input.username);
    return NextResponse.json({ data: { updated: true } }, { headers: privateHeaders });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await authorize();
    const input = parseDeleteCognitoUserInput(await body(request));
    await deleteCognitoUser(input.targetId, input.username);
    return NextResponse.json({ data: { deleted: true } }, { headers: privateHeaders });
  } catch (error) {
    return failure(error);
  }
}
