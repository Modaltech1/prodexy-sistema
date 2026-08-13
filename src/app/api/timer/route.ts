import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, ok, readJson, serverError } from "@/lib/api";

async function closeEntry(id: string) {
  const supabase = getSupabaseAdmin();
  const { data: entry, error: readError } = await supabase.from("task_time_entries").select("*").eq("id", id).single();
  if (readError) throw readError;
  const endedAt = new Date();
  const minutes = Math.max(1, Math.round((endedAt.getTime() - new Date(entry.started_at).getTime()) / 60000));
  const { data, error } = await supabase
    .from("task_time_entries")
    .update({ ended_at: endedAt.toISOString(), duration_minutes: minutes })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("task_time_entries").select("*").is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ action: "start" | "stop" | "manual"; task_id?: string; project_id?: string; minutes?: number; notes?: string }>(request);
    const supabase = getSupabaseAdmin();

    if (body.action === "start") {
      if (!body.task_id) return badRequest("Demanda obrigatória.");
      const { data: active } = await supabase.from("task_time_entries").select("id").is("ended_at", null).limit(1).maybeSingle();
      if (active?.id) await closeEntry(active.id);
      const { data: task, error: taskError } = await supabase.from("tasks").select("id,project_id").eq("id", body.task_id).single();
      if (taskError) throw taskError;
      await supabase.from("tasks").update({ status: "in_progress" }).eq("id", body.task_id).in("status", ["inbox","backlog","planned","waiting"]);
      const { data, error } = await supabase.from("task_time_entries").insert({
        task_id: body.task_id,
        project_id: task.project_id,
        started_at: new Date().toISOString(),
        notes: body.notes || null,
      }).select("*").single();
      if (error) throw error;
      return ok(data, { status: 201 });
    }

    if (body.action === "stop") {
      const { data: active, error } = await supabase.from("task_time_entries").select("id").is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!active) return badRequest("Nenhum cronômetro ativo.");
      return ok(await closeEntry(active.id));
    }

    if (body.action === "manual") {
      if (!body.task_id || !body.minutes || body.minutes <= 0) return badRequest("Demanda e minutos são obrigatórios.");
      const { data: task, error: taskError } = await supabase.from("tasks").select("project_id").eq("id", body.task_id).single();
      if (taskError) throw taskError;
      const endedAt = new Date();
      const startedAt = new Date(endedAt.getTime() - body.minutes * 60000);
      const { data, error } = await supabase.from("task_time_entries").insert({
        task_id: body.task_id, project_id: task.project_id, started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), duration_minutes: Math.round(body.minutes), notes: body.notes || null,
      }).select("*").single();
      if (error) throw error;
      return ok(data, { status: 201 });
    }

    return badRequest("Ação inválida.");
  } catch (error) {
    return serverError(error);
  }
}
