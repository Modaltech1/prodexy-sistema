import type { FinancialTransaction } from "./types";

export function isRealized(t: Pick<FinancialTransaction, "transaction_type" | "status">) {
  return t.transaction_type === "revenue" ? t.status === "received" : t.status === "paid";
}

export function isRevenueRecognized(
  transaction: {
    transaction_type?: string | null;
    status?: string | null;
    customer_payment_status?: string | null;
  },
  basis: "competence" | "cash" = "competence",
) {
  if (transaction.transaction_type !== "revenue") return false;
  if (transaction.status === "received") return true;
  return basis === "competence" && transaction.customer_payment_status === "paid";
}

export function calculateFee(grossCents: number, percentage: number, fixedCents: number) {
  return Math.max(0, Math.round(grossCents * (percentage / 100)) + fixedCents);
}

export function summarizeTransactions(transactions: FinancialTransaction[]) {
  let revenueGross = 0;
  let revenueFees = 0;
  let directCosts = 0;
  let holdingCosts = 0;
  let sharedCostsOriginal = 0;

  for (const t of transactions) {
    if (!isRealized(t) || t.archived) continue;
    if (t.transaction_type === "revenue") {
      revenueGross += Number(t.gross_amount_cents || 0);
      revenueFees += Number(t.fee_amount_cents || 0);
    } else {
      const total = Number(t.gross_amount_cents || 0) + Number(t.fee_amount_cents || 0);
      if (t.cost_scope === "holding") holdingCosts += total;
      else if (t.cost_scope === "shared") sharedCostsOriginal += total;
      else directCosts += total;
    }
  }

  const revenueNet = revenueGross - revenueFees;
  return {
    revenueGross,
    revenueFees,
    revenueNet,
    directCosts,
    holdingCosts,
    sharedCostsOriginal,
    totalCosts: directCosts + holdingCosts + sharedCostsOriginal,
    resultBeforeDistributions: revenueNet - directCosts - holdingCosts - sharedCostsOriginal,
  };
}
