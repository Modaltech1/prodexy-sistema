const MAX_CYCLES_PER_SYNC = 60;

function monthParts(competence: string) {
  const [year, month] = competence.slice(0, 7).split("-").map(Number);
  return { year, month };
}

export function normalizeCompetence(value: string) {
  return `${value.slice(0, 7)}-01`;
}

export function laterCompetence(left: string, right: string) {
  return normalizeCompetence(left) >= normalizeCompetence(right)
    ? normalizeCompetence(left)
    : normalizeCompetence(right);
}

export function dateInCycleMonth(competence: string, day: number, monthOffset = 0) {
  const { year, month } = monthParts(competence);
  const target = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(Math.trunc(day), 1), lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function listCompetences(start: string, end: string) {
  const normalizedStart = normalizeCompetence(start);
  const normalizedEnd = normalizeCompetence(end);
  if (normalizedStart > normalizedEnd) return [];

  const { year, month } = monthParts(normalizedStart);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const result: string[] = [];
  while (result.length < MAX_CYCLES_PER_SYNC) {
    const competence = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (competence > normalizedEnd) break;
    result.push(competence);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export function billingCycleState(today: string, chargeDate: string, receiptDate: string) {
  const customerPaid = today >= chargeDate;
  const received = customerPaid && today >= receiptDate;
  return {
    customerPaymentStatus: customerPaid ? "paid" as const : "scheduled" as const,
    customerPaidAt: customerPaid ? chargeDate : null,
    transactionStatus: received ? "received" as const : "planned" as const,
    realizedAt: received ? receiptDate : null,
  };
}
