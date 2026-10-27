import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { authEnabled } from "@/lib/auth/config";
import { serverError } from "@/lib/api";
import { getDatabaseInventory } from "@/features/database-explorer/server/inventory";

export const dynamic = "force-dynamic";

export async function GET() {
  // requireAdmin() aceita o administrador legado durante o bootstrap sem Auth.
  // Esta área transversal nunca pode herdar esse bypass.
  if (!authEnabled) {
    return NextResponse.json(
      { error: "Habilite o login administrativo antes de consultar os bancos." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    await requireAdmin();
    return NextResponse.json(
      { data: getDatabaseInventory() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return serverError(error);
  }
}
