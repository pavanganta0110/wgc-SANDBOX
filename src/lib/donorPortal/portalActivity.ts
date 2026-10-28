import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/donors/donorContact";
import { INVITE_RELATED_ENTITY_TYPE } from "@/lib/donorPortal/sendPortalInvites";

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface PortalActivity {
  /** People (counted by email, so two donor records for one person are one) who have ever signed in. */
  signedInPeople: number;
  /** Of those, people whose session was active in the last 30 days. */
  activeLast30Days: number;
  invitesSent: number;
  amountChangesByDonors: number;
  cancellationsByDonors: number;
}

interface SignedInPerson {
  email: string;
  lastActiveAt: Date;
}

/** One entry per person (normalized email) who has signed in to this church's portal, with their most recent activity. */
async function loadSignedInPeople(churchId: string): Promise<SignedInPerson[]> {
  const sessions = await prisma.donorPortalSession.groupBy({
    by: ["donorId"],
    where: { churchId },
    _max: { createdAt: true, lastActiveAt: true },
  });
  if (sessions.length === 0) return [];

  const donors = await prisma.donor.findMany({
    where: { churchId, id: { in: sessions.map((s) => s.donorId) } },
    select: { id: true, email: true, normalizedEmail: true },
  });
  const emailByDonor = new Map(donors.map((d) => [d.id, d.normalizedEmail ?? normalizeEmail(d.email)]));

  const byPerson = new Map<string, Date>();
  for (const s of sessions) {
    const email = emailByDonor.get(s.donorId);
    if (!email) continue;
    const last = s._max.lastActiveAt ?? s._max.createdAt;
    if (!last) continue;
    const prev = byPerson.get(email);
    if (!prev || last > prev) byPerson.set(email, last);
  }
  return [...byPerson].map(([email, lastActiveAt]) => ({ email, lastActiveAt }));
}

/** Normalized emails of everyone who has signed in — used to mark donors in the Donors list. */
export async function loadPortalSignedInEmails(churchId: string): Promise<Set<string>> {
  return new Set((await loadSignedInPeople(churchId)).map((p) => p.email));
}

/**
 * Portal usage for one church. Queries run one after another on purpose: the
 * merchant pages already fan out heavily, and concurrent loaders have exhausted
 * the pooled database connections before (see the Donors page).
 */
export async function loadPortalActivity(churchId: string): Promise<PortalActivity> {
  const people = await loadSignedInPeople(churchId);
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const invitesSent = await prisma.orgEmailLog.count({ where: { churchId, relatedEntityType: INVITE_RELATED_ENTITY_TYPE, status: "SENT" } });
  const donorActionWhere = { churchId, state: "COMPLETED", requestedByUserId: null, newValue: { path: ["source"], equals: "DONOR_PORTAL" } };
  const amountChangesByDonors = await prisma.subscriptionAction.count({ where: { ...donorActionWhere, actionType: "UPDATE_AMOUNT" } });
  const cancellationsByDonors = await prisma.subscriptionAction.count({ where: { ...donorActionWhere, actionType: "CANCEL" } });

  return {
    signedInPeople: people.length,
    activeLast30Days: people.filter((p) => p.lastActiveAt >= since).length,
    invitesSent,
    amountChangesByDonors,
    cancellationsByDonors,
  };
}
