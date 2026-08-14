"use client";

import { LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
import Image from "next/image";

type LoginResponse = {
  data?: { redirectTo?: string };
  error?: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as LoginResponse;
      if (!response.ok) throw new Error(payload.error || "Não foi possível entrar.");
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const safeRequestedPath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : null;
      window.location.assign(payload.data?.redirectTo === "/" && safeRequestedPath ? safeRequestedPath : payload.data?.redirectTo || "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-brand">
          <Image src="/prodexy-icon-light.ico" alt="" width={36} height={36} priority />
          <div><strong>Prodexy Labs</strong><span>Management</span></div>
        </div>
        <div className="auth-heading">
          <LockKeyhole size={20} />
          <div><h1 id="login-title">Acesso interno</h1><p>Entre com o acesso fornecido pela Prodexy.</p></div>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}
