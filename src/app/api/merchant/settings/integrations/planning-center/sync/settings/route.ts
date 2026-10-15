import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { updateSyncSettings } from "@/lib/integrations/planningcenter/syncActions";

const bodySchema = z
  .object({
    syncMode: z.enum(["OFF", "DRY_RUN", "LIVE"]).optional(),
    sendTiming: z.enum(["ON_PAYMENT", "ON_SETTLEMENT"]).optional(),
    syncTarget: z.enum(["GIFTS", "PROFILE_FIELDS"]).optional(),
    unmatchedDonorPolicy: z.enum(["HOLD_FOR_REVIEW", "ATTACH_LATER", "CREATE_PERSON", "ANONYMOUS"]).optional(),
    autoCommitBatches: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

export async function PUT(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    await updateSyncSettings(auth.churchId, body.data, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true });
  });
}
