import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import type { CreatePartnerAccessInput } from "@/lib/auth/contracts";
import {
  createPartnerAccess,
  editPartnerAccess,
  listPartnerAccesses,
  ManagedAccessError,
  resetPartnerPassword,
  setPartnerAccessActive,
} from "@/lib/auth/managed-users";
import { badRequest, ok, readJson, serverError } from "@/lib/api";

function managedError(error: unknown) {
  if (error instanceof ManagedAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return serverError(error);
}

export async function GET() {
  try {
    await requireAdmin();
    return ok(await listPartnerAccesses());
  } catch (error) {
    return managedError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const input = await readJson<CreatePartnerAccessInput>(request);
    const result = await createPartnerAccess(actor.id, input);
    return ok(result, { status: 201 });
  } catch (error) {
    return managedError(error);
  }
}

type PatchInput = {
  action?: "edit" | "set-active" | "reset-password";
  userId?: string;
  displayName?: string;
  partnerId?: string;
  active?: boolean;
  temporaryPassword?: string;
};

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const input = await readJson<PatchInput>(request);
    if (!input.userId || !input.action) return badRequest("Informe o acesso e a ação.");

    if (input.action === "edit") {
      return ok(await editPartnerAccess(input.userId, input.displayName || "", input.partnerId || ""));
    }
    if (input.action === "set-active") {
      if (typeof input.active !== "boolean") return badRequest("Informe o novo status do acesso.");
      return ok(await setPartnerAccessActive(input.userId, input.active));
    }
    if (input.action === "reset-password") {
      return ok(await resetPartnerPassword(input.userId, input.temporaryPassword || ""));
    }
    return badRequest("Ação inválida.");
  } catch (error) {
    return managedError(error);
  }
}
