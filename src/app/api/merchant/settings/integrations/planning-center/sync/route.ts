import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { getSyncOverview } from "@/lib/integrations/planningcenter/syncOverview";

/** Gift sync status: settings, recent deposits, and everything that needs a person. Our database only. */
export async function GET() {
  return runAsIntegrationsManager(async (auth) => NextResponse.json(await getSyncOverview(auth.churchId)));
}
