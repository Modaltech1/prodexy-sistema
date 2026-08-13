"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "./client-api";

export type Lookups = {
  projects: any[]; clients: any[]; categories: any[]; feeProfiles: any[]; partners: any[]; taskCategories: any[]; plans: any[];
};

const empty: Lookups = { projects: [], clients: [], categories: [], feeProfiles: [], partners: [], taskCategories: [], plans: [] };

export function useLookups() {
  const [data, setData] = useState<Lookups>(empty);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    try { setData(await apiFetch<Lookups>("/api/lookups")); } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  return { ...data, loading, refresh };
}
