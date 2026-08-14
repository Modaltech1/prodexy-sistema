import { requirePartner } from "@/lib/auth/access";
import { ok, serverError } from "@/lib/api";
import { getPartnerReport } from "@/lib/partner-report/service";

export async function GET(request: Request) {
  try {
    const access = await requirePartner();
    const month = new URL(request.url).searchParams.get("month");
    return ok(await getPartnerReport(access.partnerId, month), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return serverError(error);
  }
}
