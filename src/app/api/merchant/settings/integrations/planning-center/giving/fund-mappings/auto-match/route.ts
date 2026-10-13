import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { applySuggestedMappings } from "@/lib/integrations/planningcenter/givingSetup";

/** Maps every unmapped fund whose name exactly matches a Planning Center fund. */
export async function POST(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const result = await applySuggestedMappings(auth.churchId, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true, ...result });
  });
}
