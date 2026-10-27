import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { authEnabled } from "@/lib/auth/config";
import { serverError } from "@/lib/api";
import { getRegisteredDatabaseProject } from "@/features/database-explorer/registry";
import { isDatabaseExplorerConfigured, readDatabaseTableRows } from "@/features/database-explorer/server/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: RouteContext<"/api/infraestrutura/bancos/[projectId]/dados/[table]">) {
  if (!authEnabled) {
    return NextResponse.json({ error: "Habilite o login administrativo para consultar os bancos." }, { status: 403, headers: privateHeaders });
  }
  try {
    await requireAdmin();
  } catch (error) {
    return serverError(error);
  }

  const { projectId, table } = await context.params;
  if (!getRegisteredDatabaseProject(projectId)) {
    return NextResponse.json({ error: "Banco não registrado." }, { status: 404, headers: privateHeaders });
  }
  if (!isDatabaseExplorerConfigured(projectId)) {
    return NextResponse.json({ error: "Credencial do banco ainda não configurada." }, { status: 503, headers: privateHeaders });
  }

  const url = new URL(request.url);
  try {
    const data = await readDatabaseTableRows(projectId, "public", table, {
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
      sort: url.searchParams.get("sort"),
      direction: url.searchParams.get("direction"),
      search: url.searchParams.get("q"),
      filterColumn: url.searchParams.get("column"),
      filterOperator: url.searchParams.get("operator"),
    });
    if (!data) {
      return NextResponse.json({ error: "Tabela sem política de leitura." }, { status: 404, headers: privateHeaders });
    }
    return NextResponse.json({ data }, { headers: privateHeaders });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42501") {
      return NextResponse.json({ error: "Leitura de dados ainda não autorizada para esta tabela." }, { status: 403, headers: privateHeaders });
    }
    return NextResponse.json({ error: "Não foi possível consultar as linhas agora." }, { status: 503, headers: privateHeaders });
  }
}
