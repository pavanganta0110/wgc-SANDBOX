import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { createPlanningCenterFund } from "@/lib/integrations/planningcenter/givingSetup";

const bodySchema = z.object({ fundId: z.string().min(1).max(64) });

/** Creates a fund in Planning Center from a WGC fund and maps to it. */
export async function POST(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    const mapping = await createPlanningCenterFund(auth.churchId, body.data.fundId, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true, mapping });
  });
}
