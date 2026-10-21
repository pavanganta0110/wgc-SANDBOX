import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { ensurePaymentSource } from "@/lib/integrations/planningcenter/givingSetup";

/** Sets up (or re-verifies) the "WGC Payments" payment source. Idempotent.
 * Also confirms the connected Planning Center user can write to Giving. */
export async function POST(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const source = await ensurePaymentSource(auth.churchId, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true, paymentSource: source });
  });
}
