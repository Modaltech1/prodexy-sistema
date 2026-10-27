import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { authEnabled } from "@/lib/auth/config";
import { serverError } from "@/lib/api";
import { getRegisteredDatabaseProject } from "@/features/database-explorer/registry";
import { executeSql, isSqlExecutorConfigured } from "@/features/database-explorer/server/sql-executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!authEnabled) {
    return NextResponse.json({ error: "Habilite o login administrativo para usar o SQL Editor." }, { status: 403, headers: privateHeaders });
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
  if (!isSqlExecutorConfigured(projectId)) {
    return NextResponse.json({ error: "Configure a credencial do SQL Executor para este ambiente." }, { status: 503, headers: privateHeaders });
  }

  const body = await request.json().catch(() => null) as { sql?: unknown } | null;
  const sql = typeof body?.sql === "string" ? body.sql.trim() : "";
  if (!sql) {
    return NextResponse.json({ error: "Escreva um comando SQL antes de executar." }, { status: 400, headers: privateHeaders });
  }

  try {
    const result = await executeSql(projectId, sql);
    if (!result) return NextResponse.json({ error: "Banco não registrado." }, { status: 404, headers: privateHeaders });
    return NextResponse.json({ data: result }, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar SQL.";
    return NextResponse.json({ error: message }, { status: 400, headers: privateHeaders });
  }
}
