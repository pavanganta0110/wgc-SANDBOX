import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveOrCreateDonorWithMatchReview } from "@/lib/donors/resolveOrCreateDonorWithMatchReview";
import { getClientForChurch } from "./service";
import { PlanningCenterApiError, PlanningCenterConnectionError, PlanningCenterSetupError } from "./errors";
import { listPeoplePage, type PcoPersonContact } from "./people";
import { resolveDonorLink } from "./personMatching";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * Chunked, resumable bulk jobs over a church's donors or its Planning Center
 * directory, in the style of QuickBooksBackfillJob: create once, then call
 * process repeatedly until COMPLETED. Each call works for a bounded time so
 * it fits a request and stays under Planning Center's rate limit.
 */

export type PeopleJobType = "MATCH_DONORS" | "IMPORT_PEOPLE";

export const PEOPLE_JOB_TIME_BUDGET_MS = 20_000;
const DONOR_CHUNK = 25;
// A donor whose last successful payment status counts as "has given".
const GIVING_STATUSES = ["SUCCEEDED", "PARTIALLY_REFUNDED"];

interface Actor {
  userId: string;
  email?: string | null;
  role?: string | null;
  req?: Request;
}

export async function getLatestPeopleJob(churchId: string, type: PeopleJobType) {
  return prisma.planningCenterPeopleJob.findFirst({ where: { churchId, type }, orderBy: { createdAt: "desc" } });
}

/** Starts a job, or returns the one already running for this church and type. */
export async function startPeopleJob(churchId: string, type: PeopleJobType, actor: Actor) {
  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!connection || connection.status !== "CONNECTED") throw new PlanningCenterConnectionError("Connect Planning Center first.");

  const active = await prisma.planningCenterPeopleJob.findFirst({ where: { churchId, type, status: { in: ["PENDING", "RUNNING"] } } });
  if (active) return active;

  const job = await prisma.planningCenterPeopleJob.create({ data: { churchId, type, createdByUserId: actor.userId } });
  await logDashboardAction({
    churchId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: type === "MATCH_DONORS" ? "planningcenter.match_job_started" : "planningcenter.import_job_started",
    entityType: "PlanningCenterPeopleJob",
    entityId: job.id,
    req: actor.req,
  });
  return job;
}

export interface ProcessOptions {
  timeBudgetMs?: number;
  /** Test seam; defaults to a client for the church. */
  client?: PlanningCenterClient;
  now?: () => number;
}

type Job = NonNullable<Awaited<ReturnType<typeof getLatestPeopleJob>>>;

export async function processPeopleJob(churchId: string, jobId: string, options: ProcessOptions = {}): Promise<Job> {
  // The church comes from the session, so a job id from another church is simply "not found".
  const job = await prisma.planningCenterPeopleJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) throw new PlanningCenterSetupError("That job wasn't found.");
  if (job.status === "COMPLETED" || job.status === "FAILED") return job;

  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!connection || connection.status !== "CONNECTED" || !connection.pcoOrganizationId) {
    throw new PlanningCenterConnectionError("Connect Planning Center first.");
  }

  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeBudgetMs ?? PEOPLE_JOB_TIME_BUDGET_MS);
  const client = options.client ?? (await getClientForChurch(churchId));

  const counts = { processed: 0, linked: 0, review: 0, noMatch: 0, created: 0, skipped: 0, failed: 0 };
  let cursor: Record<string, unknown> = (job.cursorJson as Record<string, unknown> | null) ?? {};
  let done = false;
  let fatal: string | null = null;
  let pausedBy: string | null = null;
  let totalCount = job.totalCount;

  if (job.status === "PENDING") {
    await prisma.planningCenterPeopleJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: new Date() } });
  }

  try {
    if (job.type === "MATCH_DONORS") {
      if (totalCount === null) totalCount = (await groupDonors(churchId, undefined, undefined)).length;
      while (!done && now() < deadline) {
        const rows = await groupDonors(churchId, (cursor.lastDonorId as string | undefined) ?? "", DONOR_CHUNK);
        if (rows.length === 0) {
          done = true;
          break;
        }
        const donors = await prisma.donor.findMany({ where: { churchId, id: { in: rows }, archivedAt: null }, select: { id: true } });
        const live = new Set(donors.map((d) => d.id));
        for (const donorId of rows) {
          if (now() >= deadline) break; // resume from here next call
          cursor = { lastDonorId: donorId };
          counts.processed++;
          if (!live.has(donorId)) {
            counts.skipped++;
            continue;
          }
          try {
            const state = await resolveDonorLink(churchId, donorId, connection.pcoOrganizationId, client);
            if (state.status === "LINKED") counts.linked++;
            else if (state.status === "NEEDS_REVIEW") counts.review++;
            else counts.noMatch++;
          } catch (err) {
            if (isFatal(err)) throw err;
            counts.failed++;
          }
        }
      }
    } else {
      while (!done && now() < deadline) {
        const offset = (cursor.offset as number | undefined) ?? 0;
        const page = await listPeoplePage(client, offset);
        for (const person of page.people) {
          counts.processed++;
          try {
            await importOnePerson(churchId, connection.pcoOrganizationId, person, job.createdByUserId, counts);
          } catch (err) {
            if (isFatal(err)) throw err;
            counts.failed++;
          }
        }
        cursor = { offset: offset + page.people.length };
        if (!page.hasMore) done = true;
      }
    }
  } catch (err) {
    if (isPause(err)) pausedBy = "Planning Center asked us to slow down. The job will continue on the next step.";
    else if (isFatal(err)) fatal = err instanceof Error ? err.message : "Planning Center returned an error.";
    else throw err;
  }

  return prisma.planningCenterPeopleJob.update({
    where: { id: job.id },
    data: {
      status: fatal ? "FAILED" : done ? "COMPLETED" : "RUNNING",
      cursorJson: cursor as Prisma.InputJsonValue,
      totalCount,
      processedCount: { increment: counts.processed },
      linkedCount: { increment: counts.linked },
      reviewCount: { increment: counts.review },
      noMatchCount: { increment: counts.noMatch },
      createdCount: { increment: counts.created },
      skippedCount: { increment: counts.skipped },
      failedCount: { increment: counts.failed },
      lastError: fatal ?? pausedBy,
      completedAt: done || fatal ? new Date() : null,
    },
  });
}

/** Rate limiting pauses the job (it resumes on the next call) rather than failing it. */
function isPause(err: unknown): boolean {
  return err instanceof PlanningCenterApiError && err.normalized.category === "RATE_LIMITED";
}

/** Authentication or permission problems stop the whole job; a bad single record does not. */
function isFatal(err: unknown): boolean {
  if (isPause(err)) return true; // surfaces to the outer handler, which pauses
  if (err instanceof PlanningCenterConnectionError) return true;
  if (err instanceof PlanningCenterApiError) {
    return err.normalized.category === "AUTHENTICATION_REQUIRED" || err.normalized.category === "ACCESS_DENIED";
  }
  return false;
}

/** Distinct donors with at least one successful gift, in id order, after `after`. Undefined take = all (for the total). */
async function groupDonors(churchId: string, after: string | undefined, take: number | undefined): Promise<string[]> {
  const rows = await prisma.payment.groupBy({
    by: ["donorId"],
    where: { churchId, status: { in: GIVING_STATUSES }, donorId: after !== undefined ? { gt: after, not: null } : { not: null } },
    orderBy: { donorId: "asc" },
    ...(take ? { take } : {}),
  });
  return rows.map((r) => r.donorId).filter((id): id is string => Boolean(id));
}

async function importOnePerson(
  churchId: string,
  pcoOrganizationId: string,
  person: PcoPersonContact,
  actorUserId: string | null,
  counts: { linked: number; created: number; skipped: number }
): Promise<void> {
  // Children and inactive people aren't prospective donors; with no email or
  // phone there's nothing to identify a donor by (we never match on name).
  if (person.isInactive || person.isChild || (person.emails.length === 0 && person.phones.length === 0)) {
    counts.skipped++;
    return;
  }

  const email = person.emails[0] ?? null;
  const phone = person.phones[0] ?? null;
  const donor = await resolveOrCreateDonorWithMatchReview({
    churchId,
    name: person.name || null,
    email,
    phone,
    contactSource: "PLANNING_CENTER",
    sourceType: "PLANNING_CENTER_IMPORT",
    sourceId: person.id,
    actorUserId,
  });
  if (donor.created) counts.created++;

  // Link only when it is unambiguous and free: the donor has no link yet and
  // this person isn't linked to someone else.
  const [donorLink, personLink] = await Promise.all([
    prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId: donor.id } } }),
    prisma.planningCenterPersonLink.findFirst({ where: { churchId, pcoPersonId: person.id } }),
  ]);
  if (personLink || (donorLink && donorLink.status === "LINKED")) return;

  const now = new Date();
  const data = {
    churchId,
    donorId: donor.id,
    pcoOrganizationId,
    status: "LINKED",
    pcoPersonId: person.id,
    pcoPersonName: person.name,
    matchMethod: email ? "EMAIL" : "PHONE",
    candidatesJson: Prisma.DbNull,
    rejectedPcoPersonIds: donorLink?.rejectedPcoPersonIds ?? [],
    matchedAt: now,
    lastCheckedAt: now,
  };
  // A donor the church previously said is not this person must not be re-linked behind their back.
  if (donorLink?.rejectedPcoPersonIds.includes(person.id)) return;
  try {
    await prisma.planningCenterPersonLink.upsert({ where: { churchId_donorId: { churchId, donorId: donor.id } }, create: data, update: data });
    counts.linked++;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}
