import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/access";
import { syncSaasBilling } from "@/lib/saas-billing/service";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ project_id?: string }>(request);
    const projectId = body.project_id?.trim();
    if (!projectId) return badRequest("Projeto obrigatório.");
    return ok(await syncSaasBilling(projectId));
  } catch (error) {
    return serverError(error);
  }
}
