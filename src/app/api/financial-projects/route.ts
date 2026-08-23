import { ok, serverError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/access";
import { getFullCycleProjectComparison } from "@/lib/server-financial-comparison";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await getFullCycleProjectComparison());
  } catch (error) {
    return serverError(error);
  }
}
