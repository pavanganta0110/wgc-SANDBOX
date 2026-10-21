import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { mergeDonors } from "@/lib/donors/donorMerge";
import { PlanningCenterSetupError } from "./errors";

/**
 * "Are these the same person?" When a Planning Center person is already linked to one WGC donor and a second WGC
 * donor matches the same person, they are very likely duplicates in WGC. The church confirms, and the second donor
 * is merged INTO the already-linked one with WGC's existing donor merge (all payments, notes and history move; the
 * duplicate is archived, never deleted). The surviving donor keeps the Planning Center link, so held gifts and
 * gifts waiting for a person are attributed correctly on the next pass, and no duplicate person is ever created.
 *
 * The donor to keep is derived from OUR link table, never from the request, so a caller can't merge arbitrary donors.
 */

export interface Actor {
  userId: string;
  email?: string | null;
  role?: string | null;
  req?: Request;
}

export async function findLinkOwner(churchId: string, pcoPersonId: string, exceptDonorId: string): Promise<{ donorId: string } | null> {
  const owner = await prisma.planningCenterPersonLink.findFirst({ where: { churchId, pcoPersonId, status: "LINKED", donorId: { not: exceptDonorId } }, select: { donorId: true } });
  return owner ?? null;
}

export async function mergeIntoLinkedDonor(churchId: string, donorId: string, pcoPersonId: string, actor: Actor): Promise<{ mergedInto: string }> {
  const owner = await findLinkOwner(churchId, pcoPersonId, donorId);
  if (!owner) throw new PlanningCenterSetupError("No other donor is linked to that person, so there's nothing to merge.");

  try {
    await mergeDonors(owner.donorId, donorId, churchId, actor.userId, actor.email ?? null);
  } catch {
    // mergeDonors refuses donors outside this church or a donor merged into itself; the raw message isn't for the church.
    throw new PlanningCenterSetupError("Those two donors couldn't be merged. Refresh and try again.");
  }

  // The merged-away donor's unconfirmed link is now meaningless (it is archived); don't leave a ghost in the review list.
  await prisma.planningCenterPersonLink.deleteMany({ where: { churchId, donorId, status: { not: "LINKED" } } });

  await logDashboardAction({
    churchId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "planningcenter.donors_merged",
    entityType: "Donor",
    entityId: owner.donorId,
    metadata: { mergedDonorId: donorId, pcoPersonId },
    req: actor.req,
  });
  return { mergedInto: owner.donorId };
}
