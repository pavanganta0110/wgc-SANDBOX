import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { setDefaultFund } from "@/lib/integrations/planningcenter/givingSetup";

const bodySchema = z.object({ pcoFundId: z.string().min(1).max(64).nullable() });

export async function PUT(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    const defaultFund = await setDefaultFund(auth.churchId, body.data.pcoFundId, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true, defaultFund });
  });
}
