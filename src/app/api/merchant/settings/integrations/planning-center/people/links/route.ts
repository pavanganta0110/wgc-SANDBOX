import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { linkDonorManually, rejectCandidate, resolveDonorLink, unlinkDonor } from "@/lib/integrations/planningcenter/personMatching";
import { getClientForChurch } from "@/lib/integrations/planningcenter/service";
import { mergeIntoLinkedDonor } from "@/lib/integrations/planningcenter/sameDonorMerge";
import { PlanningCenterConnectionError } from "@/lib/integrations/planningcenter/errors";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("LINK"), donorId: z.string().min(1).max(64), pcoPersonId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("REJECT"), donorId: z.string().min(1).max(64), pcoPersonId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("UNLINK"), donorId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("RECHECK"), donorId: z.string().min(1).max(64) }),
  // "Yes, these two WGC donors are the same person": merge into the donor already linked to that Planning Center person.
  z.object({ action: z.literal("MERGE"), donorId: z.string().min(1).max(64), pcoPersonId: z.string().min(1).max(64) }),
]);

/** Link, reject, unlink or re-check one donor. The church always comes from the session. */
export async function PUT(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    const actor = { userId: auth.userId, email: auth.email, role: auth.role, req };

    const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId: auth.churchId } });
    if (!connection || connection.status !== "CONNECTED" || !connection.pcoOrganizationId) throw new PlanningCenterConnectionError("Connect Planning Center first.");
    const org = connection.pcoOrganizationId;
    const input = body.data;

    if (input.action === "MERGE") {
      const merged = await mergeIntoLinkedDonor(auth.churchId, input.donorId, input.pcoPersonId, actor);
      return NextResponse.json({ success: true, mergedInto: merged.mergedInto });
    }

    if (input.action === "UNLINK") {
      await unlinkDonor(auth.churchId, input.donorId, actor);
    } else if (input.action === "REJECT") {
      await rejectCandidate(auth.churchId, input.donorId, input.pcoPersonId, actor);
    } else {
      const client = await getClientForChurch(auth.churchId);
      if (input.action === "LINK") await linkDonorManually(auth.churchId, input.donorId, input.pcoPersonId, org, client, actor);
      else {
        // Re-check: forget a cached "nobody found" and look again (e.g. after adding the person in Planning Center).
        await prisma.planningCenterPersonLink.updateMany({ where: { churchId: auth.churchId, donorId: input.donorId, status: "NO_MATCH" }, data: { lastCheckedAt: new Date(0) } });
        const state = await resolveDonorLink(auth.churchId, input.donorId, org, client, { force: true });
        return NextResponse.json({ success: true, status: state.status });
      }
    }
    return NextResponse.json({ success: true });
  });
}
