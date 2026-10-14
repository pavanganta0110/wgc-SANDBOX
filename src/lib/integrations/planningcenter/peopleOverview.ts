import { prisma } from "@/lib/prisma";
import type { MatchCandidate } from "./personMatching";
import type { PeopleJobSummary, PeopleOverview } from "./peopleTypes";

const REVIEW_LIMIT = 50;

function toJob(j: Awaited<ReturnType<typeof prisma.planningCenterPeopleJob.findFirst>>): PeopleJobSummary | null {
  if (!j) return null;
  return {
    id: j.id,
    type: j.type as PeopleJobSummary["type"],
    status: j.status as PeopleJobSummary["status"],
    totalCount: j.totalCount,
    processedCount: j.processedCount,
    linkedCount: j.linkedCount,
    reviewCount: j.reviewCount,
    noMatchCount: j.noMatchCount,
    createdCount: j.createdCount,
    skippedCount: j.skippedCount,
    failedCount: j.failedCount,
    lastError: j.lastError,
  };
}

/** Everything the People panel shows, from our own database. No Planning Center calls. */
export async function getPeopleOverview(churchId: string, pcoOrganizationId: string): Promise<PeopleOverview> {
  const [linked, needsReview, noMatch, reviewRows, matchJob, importJob] = await Promise.all([
    prisma.planningCenterPersonLink.count({ where: { churchId, pcoOrganizationId, status: "LINKED" } }),
    prisma.planningCenterPersonLink.count({ where: { churchId, pcoOrganizationId, status: "NEEDS_REVIEW" } }),
    prisma.planningCenterPersonLink.count({ where: { churchId, pcoOrganizationId, status: "NO_MATCH" } }),
    prisma.planningCenterPersonLink.findMany({ where: { churchId, pcoOrganizationId, status: "NEEDS_REVIEW" }, orderBy: { updatedAt: "desc" }, take: REVIEW_LIMIT }),
    prisma.planningCenterPeopleJob.findFirst({ where: { churchId, type: "MATCH_DONORS" }, orderBy: { createdAt: "desc" } }),
    prisma.planningCenterPeopleJob.findFirst({ where: { churchId, type: "IMPORT_PEOPLE" }, orderBy: { createdAt: "desc" } }),
  ]);

  const donorIds = reviewRows.map((r) => r.donorId);
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { churchId, id: { in: donorIds } }, select: { id: true, name: true, email: true, phone: true } }) : [];
  const donorById = new Map(donors.map((d) => [d.id, d]));

  return {
    counts: { linked, needsReview, noMatch },
    review: reviewRows.map((r) => {
      const d = donorById.get(r.donorId);
      return {
        donorId: r.donorId,
        donorName: d?.name ?? null,
        donorEmail: d?.email ?? null,
        donorPhone: d?.phone ?? null,
        candidates: Array.isArray(r.candidatesJson) ? (r.candidatesJson as unknown as MatchCandidate[]) : [],
      };
    }),
    matchJob: toJob(matchJob),
    importJob: toJob(importJob),
  };
}
