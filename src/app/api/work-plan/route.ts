import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, ok, readJson, serverError } from "@/lib/api";

function taskScore(task: any, now: Date) {
  let score = { critical: 100, high: 70, medium: 40, low: 20 }[task.priority as "critical"|"high"|"medium"|"low"] || 20;
  const reasons: string[] = [{ critical: "prioridade crítica", high: "prioridade alta", medium: "prioridade média", low: "prioridade baixa" }[task.priority as "critical"|"high"|"medium"|"low"] || "prioridade"];
  if (task.due_at) {
    const diffDays = (new Date(task.due_at).getTime() - now.getTime()) / 86400000;
    if (diffDays < 0) { score += 60; reasons.push("atrasada"); }
    else if (diffDays <= 1) { score += 40; reasons.push("vence em até 24h"); }
    else if (diffDays <= 3) { score += 25; reasons.push("prazo próximo"); }
  }
  if (task.status === "in_progress") { score += 25; reasons.push("já em andamento"); }
  if (task.status === "waiting") { score -= 20; reasons.push("aguardando"); }
  if (task.client_id) { score += 12; reasons.push("cliente relacionado"); }
  const category = String(task.category_name || "").toLowerCase();
  if (category.includes("finance")) { score += 8; reasons.push("impacto financeiro"); }
  if (category.includes("comercial")) { score += 8; reasons.push("impacto comercial"); }
  return { score, reasons };
}

async function buildPlan(availableMinutes: number) {
  const supabase = getSupabaseAdmin();
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, task_categories(name), projects(name), clients(name)")
    .eq("archived", false)
    .not("status", "in", '("done","cancelled")')
    .order("created_at", { ascending: true });
  if (error) throw error;
  const now = new Date();
  const scored = (tasks ?? []).map((task: any) => {
    const categoryName = task.task_categories?.name || "";
    const scoredTask = taskScore({ ...task, category_name: categoryName }, now);
    return {
      ...task,
      project_name: task.projects?.name || null,
      client_name: task.clients?.name || null,
      category_name: categoryName,
      score: scoredTask.score,
      reason: scoredTask.reasons.join(" + "),
      planned_minutes: Math.max(15, Number(task.estimated_minutes || 45)),
    };
  }).sort((a, b) => b.score - a.score || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const selected: any[] = [];
  let remaining = availableMinutes;
  for (const task of scored) {
    if (remaining < 15) break;
    const duration = Math.min(task.planned_minutes, remaining);
    if (duration < 15) continue;
    selected.push({ ...task, planned_minutes: duration });
    remaining -= duration;
  }
  return { available_minutes: availableMinutes, planned_minutes: availableMinutes - remaining, remaining_minutes: remaining, items: selected };
}

export async function GET(request: NextRequest) {
  try {
    const minutes = Math.max(15, Math.min(12 * 60, Number(request.nextUrl.searchParams.get("minutes") || 360)));
    return ok(await buildPlan(minutes));
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ available_minutes: number; items: { task_id: string; planned_minutes: number; score?: number; reason?: string; pinned?: boolean }[] }>(request);
    if (!body.available_minutes || !body.items?.length) return badRequest("Plano vazio.");
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase.from("work_sessions").insert({ available_minutes: body.available_minutes, status: "planned" }).select("*").single();
    if (error) throw error;
    const rows = body.items.map((item, index) => ({ work_session_id: session.id, task_id: item.task_id, position: index, planned_minutes: item.planned_minutes, score: item.score ?? null, reason: item.reason ?? null, pinned: item.pinned ?? false }));
    const { error: itemsError } = await supabase.from("work_session_items").insert(rows);
    if (itemsError) throw itemsError;
    return ok({ session, items: rows }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
