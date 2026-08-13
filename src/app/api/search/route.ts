import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ok, serverError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) return ok([]);
    const supabase = getSupabaseAdmin();
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const [projects, clients, tasks, leads] = await Promise.all([
      supabase.from("projects").select("id,name,status").ilike("name", pattern).limit(5),
      supabase.from("clients").select("id,name,status").ilike("name", pattern).limit(5),
      supabase.from("tasks").select("id,title,status,project_id").ilike("title", pattern).eq("archived", false).limit(5),
      supabase.from("leads").select("id,name,company,stage").or(`name.ilike.${pattern},company.ilike.${pattern}`).limit(5),
    ]);
    for (const r of [projects, clients, tasks, leads]) if (r.error) throw r.error;
    return ok([
      ...(projects.data ?? []).map((x) => ({ type: "project", id: x.id, label: x.name, meta: "Projeto", href: `/projetos/${x.id}` })),
      ...(clients.data ?? []).map((x) => ({ type: "client", id: x.id, label: x.name, meta: "Cliente", href: `/clientes?cliente=${x.id}` })),
      ...(tasks.data ?? []).map((x) => ({ type: "task", id: x.id, label: x.title, meta: "Demanda", href: `/demandas?tarefa=${x.id}` })),
      ...(leads.data ?? []).map((x) => ({ type: "lead", id: x.id, label: x.company || x.name, meta: "Lead", href: `/comercial?lead=${x.id}` })),
    ]);
  } catch (error) {
    return serverError(error);
  }
}
