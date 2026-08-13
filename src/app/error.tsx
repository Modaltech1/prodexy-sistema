"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="panel error-page">
      <AlertTriangle size={24} />
      <div>
        <h1>Não foi possível carregar esta área</h1>
        <p>{error.message || "Ocorreu um erro inesperado."}</p>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </section>
  );
}
