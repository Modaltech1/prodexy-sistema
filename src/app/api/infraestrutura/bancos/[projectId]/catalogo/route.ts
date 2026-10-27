import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { authEnabled } from "@/lib/auth/config";
import { serverError } from "@/lib/api";
import { getRegisteredDatabaseProject } from "@/features/database-explorer/registry";
import { isDatabaseObserverConfigured, readDatabaseCatalog } from "@/features/database-explorer/server/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: RouteContext<"/api/infraestrutura/bancos/[projectId]/catalogo">) {
  if (!authEnabled) {
    return NextResponse.json({ error: "Habilite o login administrativo para consultar os bancos." }, { status: 403, headers: privateHeaders });
  }
  try {
    await requireAdmin();
  } catch (error) {
    return serverError(error);
  }

  const { projectId } = await context.params;
  if (!getRegisteredDatabaseProject(projectId)) {
    return NextResponse.json({ error: "Banco não registrado." }, { status: 404, headers: privateHeaders });
  }
  if (!isDatabaseObserverConfigured(projectId)) {
    return NextResponse.json({ error: "Acesso de observação ainda não configurado.", state: "pending" }, { status: 503, headers: privateHeaders });
  }
  try {
    const catalog = await readDatabaseCatalog(projectId);
    if (!catalog) return NextResponse.json({ error: "Banco não registrado." }, { status: 404, headers: privateHeaders });
    return NextResponse.json({ data: catalog }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar o DB Node agora.", state: "unavailable" }, { status: 503, headers: privateHeaders });
  }
}
