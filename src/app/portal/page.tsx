import Image from "next/image";
import { connection } from "next/server";
import { LogoutButton } from "@/components/logout-button";
import { PartnerReport } from "@/app/portal/partner-report";
import { requirePartner } from "@/lib/auth/access";
import { currentCompetence } from "@/lib/date";
import { getPartnerReport } from "@/lib/partner-report/service";

export default async function PartnerPortalPage() {
  await connection();
  const access = await requirePartner();
  const report = await getPartnerReport(access.partnerId, currentCompetence().slice(0, 7));

  return (
    <main className="portal-page">
      <header className="portal-header">
        <div className="auth-brand">
          <Image src="/prodexy-icon-light.ico" alt="" width={36} height={36} priority />
          <div><strong>Prodexy Labs</strong><span>Portal do sócio</span></div>
        </div>
        <LogoutButton />
      </header>
      <PartnerReport initialData={report} displayName={access.displayName} />
    </main>
  );
}
