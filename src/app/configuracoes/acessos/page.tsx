import { LockKeyhole } from "lucide-react";
import { authEnabled } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/access";
import { listPartnerAccesses } from "@/lib/auth/managed-users";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNavigation } from "@/components/settings-navigation";
import { AccessManagement } from "./access-management";

export default async function AccessManagementPage() {
  if (!authEnabled) {
    return (
      <>
        <PageHeader title="Configurações" description="Cadastros, automações e segurança do workspace." />
        <div className="settings-layout">
          <aside className="settings-navigation-wrap"><SettingsNavigation active="accesses" /></aside>
          <main className="settings-workspace">
            <div className="settings-section-header"><div><h2>Acessos de sócios</h2><p>Contas vinculadas às participações dos projetos.</p></div></div>
            <section className="panel access-disabled-state">
              <LockKeyhole size={24} />
              <div><strong>Login ainda não ativado</strong><p>Ative a autenticação deste ambiente para administrar as contas dos sócios.</p></div>
            </section>
          </main>
        </div>
      </>
    );
  }

  await requireAdmin();
  const initialData = await listPartnerAccesses();
  return (
    <>
      <PageHeader title="Configurações" description="Cadastros, automações e segurança do workspace." />
      <div className="settings-layout">
        <aside className="settings-navigation-wrap"><SettingsNavigation active="accesses" /></aside>
        <main className="settings-workspace"><AccessManagement initialData={initialData} /></main>
      </div>
    </>
  );
}
