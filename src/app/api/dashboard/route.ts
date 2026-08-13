import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/api";
import { getFinancialDashboard } from "@/lib/server-finance";

export async function GET(request: NextRequest) {
  try {
    return ok(await getFinancialDashboard(request.nextUrl.searchParams.get("month"), request.nextUrl.searchParams.get("basis")));
  } catch (error) {
    return serverError(error);
  }
}
