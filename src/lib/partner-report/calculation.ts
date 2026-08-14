import type { PartnerShareKind } from "@/lib/partner-report/contracts";

type PartnerShareInput = {
  closed: boolean;
  profitCents: number;
  participationPercentage: number;
  compositionValid: boolean;
  confirmedAmountCents: number;
};

export function calculatePartnerShare(input: PartnerShareInput): {
  partnerShareCents: number | null;
  shareKind: PartnerShareKind;
} {
  if (input.closed) {
    return { partnerShareCents: input.confirmedAmountCents, shareKind: "confirmed" };
  }
  if (input.profitCents <= 0) {
    return { partnerShareCents: 0, shareKind: "estimated" };
  }
  if (!input.compositionValid) {
    return { partnerShareCents: null, shareKind: "unavailable" };
  }
  return {
    partnerShareCents: Math.round(input.profitCents * input.participationPercentage / 100),
    shareKind: "estimated",
  };
}
