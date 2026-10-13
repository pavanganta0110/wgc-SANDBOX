import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { saveFundMapping } from "@/lib/integrations/planningcenter/givingSetup";

// `pcoFundId: null` removes the mapping.
const bodySchema = z.object({ fundId: z.string().min(1).max(64), pcoFundId: z.string().min(1).max(64).nullable() });

export async function PUT(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    const mapping = await saveFundMapping(auth.churchId, body.data.fundId, body.data.pcoFundId, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true, mapping });
  });
}
