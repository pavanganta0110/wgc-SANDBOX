import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { resolveDonationRecord } from "@/lib/integrations/planningcenter/syncActions";

const bodySchema = z.object({ action: z.enum(["RETRY", "SKIP"]) });

/** RETRY = "I checked Planning Center and it isn't there"; SKIP = "don't send this gift". */
export async function POST(req: Request, ctx: { params: Promise<{ donationId: string }> }) {
  const { donationId } = await ctx.params;
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    await resolveDonationRecord(auth.churchId, donationId, body.data.action, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true });
  });
}
