import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, ok, readJson, serverError } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ action: "close" | "reopen"; project_id?: string; competence_month?: string; closing_id?: string }>(request);
    const supabase = getSupabaseAdmin();

    if (body.action === "close") {
      if (!body.project_id || !body.competence_month) return badRequest("Projeto e competência são obrigatórios.");
      const { data, error } = await supabase.rpc("close_project_month", {
        p_project_id: body.project_id,
        p_competence_month: `${body.competence_month.slice(0, 7)}-01`,
      });
      if (error) throw error;
      return ok({ closing_id: data });
    }

    if (body.action === "reopen") {
      if (!body.closing_id) return badRequest("Fechamento obrigatório.");
      const { error } = await supabase.rpc("reopen_project_month", { p_closing_id: body.closing_id });
      if (error) throw error;
      return ok({ closing_id: body.closing_id });
    }

    return badRequest("Ação inválida.");
  } catch (error) {
    return serverError(error);
  }
}
