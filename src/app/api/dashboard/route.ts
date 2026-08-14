import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/api";
import { getFinancialDashboard } from "@/lib/server-finance";
import { requireAdmin } from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    return ok(await getFinancialDashboard(request.nextUrl.searchParams.get("month"), request.nextUrl.searchParams.get("basis")));
  } catch (error) {
    return serverError(error);
  }
}
