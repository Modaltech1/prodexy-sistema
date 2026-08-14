import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { authEnabled } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/access";
import { listPartnerAccesses } from "@/lib/auth/managed-users";
import { PageHeader } from "@/components/ui/page-header";
import { AccessManagement } from "./access-management";

export default async function AccessManagementPage() {
  if (!authEnabled) {
    return (
      <>
        <PageHeader title="Acessos" description="Sublogins administrados para sócios da Prodexy." />
        <div className="tabs"><Link className="tab" href="/configuracoes">Cadastros</Link><span className="tab active">Acessos</span></div>
        <section className="panel access-disabled-state">
          <LockKeyhole size={24} />
          <div><strong>Login ainda não ativado</strong><p>Execute as migrations de acesso, crie o administrador e ative a autenticação para gerenciar sublogins.</p></div>
        </section>
      </>
    );
  }

  await requireAdmin();
  const initialData = await listPartnerAccesses();
  return <AccessManagement initialData={initialData} />;
}
