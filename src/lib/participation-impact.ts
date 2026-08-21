export type ParticipationRecord = {
  project_id: string;
  partner_id: string;
  participation_percentage: number | string;
  start_date: string;
  end_date?: string | null;
  active?: boolean;
};

export type PartnerRecord = {
  id: string;
  name: string;
  partner_type: "holding" | "external";
};

export type ParticipationImpact = {
  valid: boolean;
  totalPercentage: number;
  shares: Array<{
    partnerId: string;
    partnerName: string;
    partnerType: "holding" | "external";
    percentage: number;
    amountCents: number;
  }>;
};

export function calculateParticipationImpact(
  amountCents: number,
  projectId: string,
  competenceMonth: string,
  participations: ParticipationRecord[],
  partners: PartnerRecord[],
): ParticipationImpact {
  const active = participations.filter((participation) => (
    participation.project_id === projectId
    && participation.active !== false
    && participation.start_date <= competenceMonth
    && (!participation.end_date || participation.end_date >= competenceMonth)
  ));

  if (!active.length) {
    const holding = partners.find((partner) => partner.partner_type === "holding");
    return {
      valid: true,
      totalPercentage: 100,
      shares: [{
        partnerId: holding?.id || "holding",
        partnerName: holding?.name || "Prodexy Labs",
        partnerType: "holding",
        percentage: 100,
        amountCents,
      }],
    };
  }

  const totalPercentage = active.reduce(
    (sum, participation) => sum + Number(participation.participation_percentage || 0),
    0,
  );
  const valid = Math.abs(totalPercentage - 100) <= 0.0001;
  if (!valid) return { valid, totalPercentage, shares: [] };

  const shares = active.map((participation) => {
    const partner = partners.find((item) => item.id === participation.partner_id);
    const percentage = Number(participation.participation_percentage || 0);
    return {
      partnerId: participation.partner_id,
      partnerName: partner?.name || "Participante",
      partnerType: partner?.partner_type || "external" as const,
      percentage,
      amountCents: Math.round(amountCents * percentage / 100),
    };
  }).sort((left, right) => Number(right.partnerType === "holding") - Number(left.partnerType === "holding"));

  const difference = amountCents - shares.reduce((sum, share) => sum + share.amountCents, 0);
  const adjustmentIndex = Math.max(0, shares.findIndex((share) => share.partnerType === "holding"));
  shares[adjustmentIndex].amountCents += difference;

  return { valid, totalPercentage, shares };
}
