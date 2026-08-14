"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

type PasswordResponse = { data?: { redirectTo?: string }; error?: string };

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as PasswordResponse;
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar a senha.");
      window.location.assign(payload.data?.redirectTo || "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a senha.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="password-title">
        <div className="auth-heading">
          <KeyRound size={20} />
          <div><h1 id="password-title">Defina sua senha</h1><p>Troque a senha temporária antes de continuar.</p></div>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="field"><label htmlFor="new-password">Nova senha</label><input id="new-password" className="input" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <div className="field"><label htmlFor="password-confirmation">Confirmar senha</label><input id="password-confirmation" className="input" type="password" autoComplete="new-password" minLength={10} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
          <p className="auth-password-rule">Mínimo de 10 caracteres, com maiúscula, minúscula e número.</p>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar senha"}</button>
        </form>
        <div className="auth-secondary-action"><LogoutButton /></div>
      </section>
    </main>
  );
}

