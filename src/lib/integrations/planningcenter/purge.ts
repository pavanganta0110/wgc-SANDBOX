import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Deletes the Planning Center people data WGC holds for a church, when the church disconnects and asks for it.
 *
 * DELETED (this church only):
 *  - every matched-person record: the Planning Center person id and name, the candidate names/emails/phones kept
 *    while a match was waiting for review, and the fingerprint of what was written to their profile;
 *  - the match and import job history (counts only);
 *  - the stored ids of the "WGC Giving" profile section in the church's Planning Center.
 *
 * KEPT, on purpose:
 *  - donors already in WGC, including any created by importing people. They are the church's own donor records with
 *    payments and tax receipts attached; deleting them would destroy financial history. Deleting a donor is a
 *    separate, deliberate action in WGC;
 *  - the record of gifts WGC sent (amounts, dates, Planning Center donation ids), which the church's books may rely on;
 *  - the church's fund choices.
 */
export interface PurgeResult {
  deletedLinks: number;
  deletedJobs: number;
}

export async function purgePlanningCenterPeopleData(churchId: string): Promise<PurgeResult> {
  const [links, jobs] = await prisma.$transaction([
    prisma.planningCenterPersonLink.deleteMany({ where: { churchId } }),
    prisma.planningCenterPeopleJob.deleteMany({ where: { churchId } }),
    prisma.planningCenterSyncConfig.updateMany({ where: { churchId }, data: { pcoProfileTabId: null, pcoProfileFieldIds: Prisma.JsonNull } }),
  ]);
  return { deletedLinks: links.count, deletedJobs: jobs.count };
}
