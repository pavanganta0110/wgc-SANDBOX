import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { getProfilePreview } from "@/lib/integrations/planningcenter/profilePreview";

/** How the "WGC Giving" section would look on people in Planning Center. Our database only; nothing is sent. */
export async function GET() {
  return runAsIntegrationsManager(async (auth) => NextResponse.json(await getProfilePreview(auth.churchId)));
}
