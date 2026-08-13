import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel error-page">
      <div>
        <h1>Página não encontrada</h1>
        <p>O endereço não corresponde a nenhuma área do sistema.</p>
        <Link className="button button-primary" href="/">Voltar para Hoje</Link>
      </div>
    </section>
  );
}
