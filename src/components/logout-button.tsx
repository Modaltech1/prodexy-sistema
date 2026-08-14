"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className={compact ? "sidebar-logout" : "button button-secondary"}
      onClick={logout}
      disabled={loading}
      title="Sair"
    >
      <LogOut size={16} />
      <span>{loading ? "Saindo..." : "Sair"}</span>
    </button>
  );
}
