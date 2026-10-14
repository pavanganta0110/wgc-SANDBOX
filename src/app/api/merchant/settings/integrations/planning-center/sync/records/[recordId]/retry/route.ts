import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { retrySyncRecord } from "@/lib/integrations/planningcenter/syncActions";

export async function POST(req: Request, ctx: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await ctx.params;
  return runAsIntegrationsManager(async (auth) => {
    await retrySyncRecord(auth.churchId, recordId, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true });
  });
}
