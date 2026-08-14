export type PartnerShareKind = "confirmed" | "estimated" | "unavailable";
export type PartnerPaymentStatus = "pending" | "paid" | "cancelled" | "mixed" | null;

export type PartnerReportProject = {
  id: string;
  name: string;
  projectType: string;
  closed: boolean;
  closedAt: string | null;
  participationPercentage: number;
  compositionValid: boolean;
  revenueGrossCents: number;
  revenueFeesCents: number;
  revenueNetCents: number;
  directCostsCents: number;
  sharedCostsCents: number;
  profitCents: number;
  marginPercentage: number | null;
  partnerShareCents: number | null;
  shareKind: PartnerShareKind;
  paymentStatus: PartnerPaymentStatus;
};

export type PartnerReportData = {
  month: string;
  generatedAt: string;
  partnerName: string;
  projects: PartnerReportProject[];
};

export type PartnerReportSummary = {
  revenueGrossCents: number;
  revenueFeesCents: number;
  revenueNetCents: number;
  directCostsCents: number;
  sharedCostsCents: number;
  profitCents: number;
  partnerShareCents: number;
  partnerShareComplete: boolean;
};

export function summarizePartnerProjects(projects: PartnerReportProject[]): PartnerReportSummary {
  return projects.reduce<PartnerReportSummary>((summary, project) => ({
    revenueGrossCents: summary.revenueGrossCents + project.revenueGrossCents,
    revenueFeesCents: summary.revenueFeesCents + project.revenueFeesCents,
    revenueNetCents: summary.revenueNetCents + project.revenueNetCents,
    directCostsCents: summary.directCostsCents + project.directCostsCents,
    sharedCostsCents: summary.sharedCostsCents + project.sharedCostsCents,
    profitCents: summary.profitCents + project.profitCents,
    partnerShareCents: summary.partnerShareCents + (project.partnerShareCents ?? 0),
    partnerShareComplete: summary.partnerShareComplete && project.partnerShareCents !== null,
  }), {
    revenueGrossCents: 0,
    revenueFeesCents: 0,
    revenueNetCents: 0,
    directCostsCents: 0,
    sharedCostsCents: 0,
    profitCents: 0,
    partnerShareCents: 0,
    partnerShareComplete: true,
  });
}
