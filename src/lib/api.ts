import { NextResponse } from "next/server";
import { AccessError } from "@/lib/auth/access";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function serverError(error: unknown) {
  if (error instanceof AccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Erro interno.";
  console.error(error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
