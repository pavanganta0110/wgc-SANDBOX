import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { syncNow } from "@/lib/integrations/planningcenter/syncActions";

export const maxDuration = 60;

const bodySchema = z.object({ recomputePreview: z.boolean().optional() });

/** "Sync now": one bounded pass for this church. Safe alongside the cron. */
export async function POST(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    const summary = await syncNow(auth.churchId, { userId: auth.userId, email: auth.email, role: auth.role, req }, { recomputeDryRun: body.data.recomputePreview });
    return NextResponse.json({ success: true, processed: summary.settlementsProcessed, stoppedForTime: summary.stoppedForTime });
  });
}
