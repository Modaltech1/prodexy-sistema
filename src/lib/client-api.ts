export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Falha na requisição.");
  return payload.data as T;
}

export async function crudCreate<T>(resource: string, body: unknown) {
  return apiFetch<T>(`/api/crud/${resource}`, { method: "POST", body: JSON.stringify(body) });
}

export async function crudUpdate<T>(resource: string, id: string, body: Record<string, unknown>) {
  return apiFetch<T>(`/api/crud/${resource}`, { method: "PATCH", body: JSON.stringify({ id, ...body }) });
}

export async function crudDelete<T>(resource: string, id: string) {
  return apiFetch<T>(`/api/crud/${resource}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
