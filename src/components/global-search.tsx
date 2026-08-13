"use client";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";

type Result = { type: string; id: string; label: string; meta: string; href: string };

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); return; }
      try { setResults(await apiFetch<Result[]>(`/api/search?q=${encodeURIComponent(q)}`)); setOpen(true); } catch { setResults([]); }
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const handler = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler);
  }, []);

  return <div className="global-search" ref={box}>
    <Search size={17}/><input value={q} onFocus={() => q.length >= 2 && setOpen(true)} onChange={(e) => setQ(e.target.value)} placeholder="Buscar projeto, cliente, demanda ou lead..." />
    {q && <button onClick={() => { setQ(""); setResults([]); }}><X size={15}/></button>}
    {open && <div className="search-results">
      {results.length === 0 ? <div className="search-empty">Nenhum resultado.</div> : results.map((r) => <button key={`${r.type}-${r.id}`} onClick={() => { setOpen(false); setQ(""); router.push(r.href); }}><span>{r.label}</span><small>{r.meta}</small></button>)}
    </div>}
  </div>;
}
