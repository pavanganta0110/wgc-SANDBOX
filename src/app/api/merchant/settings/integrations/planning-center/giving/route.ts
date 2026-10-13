import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { getGivingSetupState } from "@/lib/integrations/planningcenter/givingSetup";

/** Live view of the church's Planning Center Giving setup (payment source,
 * default fund, fund mappings, readiness). Reads from Planning Center. */
export async function GET() {
  return runAsIntegrationsManager(async (auth) => NextResponse.json(await getGivingSetupState(auth.churchId)));
}
