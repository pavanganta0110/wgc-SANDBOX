import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { PlanningCenterSetupError } from "./errors";
import { getPerson, searchPeople, type PcoPersonContact } from "./people";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * Phase 2: linking WGC donors to Planning Center people, used only to
 * attribute pushed gifts. The rules exist to protect donors' tax statements:
 *
 *  - Never match on name alone.
 *  - Never auto-link when more than one Planning Center person matches
 *    (spouses commonly share an email) — a human chooses.
 *  - A phone-only match auto-links only if the name also matches exactly
 *    (household phones are shared).
 *  - Inactive people and children are never matched automatically.
 *  - A person already linked to a different donor is never auto-linked to a
 *    second one (that points at duplicate donors) — it goes to review.
 *  - A person the church rejected for a donor is never offered again.
 */

export interface MatchDonorInput {
  name: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
}

export interface MatchCandidate {
  pcoPersonId: string;
  name: string;
  emails: string[];
  phones: string[];
  /** Set when this person is already linked to a different WGC donor. */
  alreadyLinkedDonorId?: string;
}

export type MatchOutcome =
  | { kind: "LINKED"; person: PcoPersonContact; method: "EMAIL" | "EMAIL_NAME" | "PHONE" }
  | { kind: "NEEDS_REVIEW"; candidates: MatchCandidate[] }
  | { kind: "NO_MATCH" };

/** How long a "nobody found" result is trusted before we look again. */
export const NO_MATCH_RECHECK_MS = 24 * 60 * 60 * 1000;

const normalizeName = (n: string | null | undefined) => (n ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function toCandidate(p: PcoPersonContact, linkedElsewhere: Map<string, string>): MatchCandidate {
  return {
    pcoPersonId: p.id,
    name: p.name,
    emails: p.emails,
    phones: p.phones,
    ...(linkedElsewhere.has(p.id) ? { alreadyLinkedDonorId: linkedElsewhere.get(p.id)! } : {}),
  };
}

/**
 * Pure decision over a donor and the people Planning Center returned for
 * their email and phone. `linkedElsewhere` maps pcoPersonId → the other donor
 * it is already linked to; `rejected` are people the church ruled out.
 */
export function decideMatch(
  donor: MatchDonorInput,
  found: { byEmail: PcoPersonContact[]; byPhone: PcoPersonContact[] },
  context: { linkedElsewhere: Map<string, string>; rejected: Set<string> }
): MatchOutcome {
  const usable = (p: PcoPersonContact) => !p.isInactive && !p.isChild && !context.rejected.has(p.id);

  // The search is a fuzzy "contains": verify the exact detail ourselves.
  const emailMatches = donor.normalizedEmail ? found.byEmail.filter((p) => usable(p) && p.emails.includes(donor.normalizedEmail!)) : [];
  const phoneMatches = donor.normalizedPhone ? found.byPhone.filter((p) => usable(p) && p.phones.includes(donor.normalizedPhone!)) : [];

  const finish = (person: PcoPersonContact, method: "EMAIL" | "EMAIL_NAME" | "PHONE"): MatchOutcome =>
    context.linkedElsewhere.has(person.id)
      ? { kind: "NEEDS_REVIEW", candidates: [toCandidate(person, context.linkedElsewhere)] }
      : { kind: "LINKED", person, method };

  if (emailMatches.length === 1) return finish(emailMatches[0], "EMAIL");

  if (emailMatches.length > 1) {
    // Shared family email. Auto-pick only if exactly one has the donor's exact full name.
    const wanted = normalizeName(donor.name);
    const byName = wanted ? emailMatches.filter((p) => normalizeName(p.name) === wanted) : [];
    if (byName.length === 1) return finish(byName[0], "EMAIL_NAME");
    return { kind: "NEEDS_REVIEW", candidates: emailMatches.map((p) => toCandidate(p, context.linkedElsewhere)) };
  }

  if (phoneMatches.length === 1) {
    const only = phoneMatches[0];
    const wanted = normalizeName(donor.name);
    if (wanted && normalizeName(only.name) === wanted) return finish(only, "PHONE");
    return { kind: "NEEDS_REVIEW", candidates: [toCandidate(only, context.linkedElsewhere)] };
  }
  if (phoneMatches.length > 1) {
    return { kind: "NEEDS_REVIEW", candidates: phoneMatches.map((p) => toCandidate(p, context.linkedElsewhere)) };
  }

  return { kind: "NO_MATCH" };
}

/** The Planning Center side of matching: search by email, then by phone only if the email found nobody exact. */
export async function lookupPeople(
  client: PlanningCenterClient,
  donor: MatchDonorInput
): Promise<{ byEmail: PcoPersonContact[]; byPhone: PcoPersonContact[] }> {
  // A donor with neither email nor phone can only ever be matched on name, which we never do.
  if (!donor.normalizedEmail && !donor.normalizedPhone) return { byEmail: [], byPhone: [] };

  const byEmail = donor.normalizedEmail ? await searchPeople(client, donor.normalizedEmail) : [];
  const exactEmail = byEmail.some((p) => p.emails.includes(donor.normalizedEmail!));
  const byPhone = donor.normalizedPhone && !exactEmail ? await searchPeople(client, donor.normalizedPhone) : [];
  return { byEmail, byPhone };
}

export interface Actor {
  userId: string;
  email?: string | null;
  role?: string | null;
  req?: Request;
}

async function linkedElsewhereFor(churchId: string, donorId: string, personIds: string[]): Promise<Map<string, string>> {
  if (personIds.length === 0) return new Map();
  const rows = await prisma.planningCenterPersonLink.findMany({
    where: { churchId, status: "LINKED", pcoPersonId: { in: personIds }, donorId: { not: donorId } },
    select: { pcoPersonId: true, donorId: true },
  });
  return new Map(rows.filter((r) => r.pcoPersonId).map((r) => [r.pcoPersonId!, r.donorId]));
}

export interface LinkState {
  status: "LINKED" | "NEEDS_REVIEW" | "NO_MATCH";
  pcoPersonId: string | null;
}

/**
 * Returns the donor's link, matching against Planning Center when needed:
 *  - LINKED / NEEDS_REVIEW are returned as is (a human owns NEEDS_REVIEW);
 *  - NO_MATCH is re-checked only after NO_MATCH_RECHECK_MS (or when forced);
 *  - no row yet → match now.
 * Never throws for "no match"; Planning Center errors propagate.
 */
export async function resolveDonorLink(
  churchId: string,
  donorId: string,
  pcoOrganizationId: string,
  client: PlanningCenterClient,
  options: { force?: boolean; now?: Date } = {}
): Promise<LinkState> {
  const now = options.now ?? new Date();
  const [existing, donor] = await Promise.all([
    prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId } } }),
    prisma.donor.findFirst({ where: { id: donorId, churchId } }),
  ]);
  if (!donor) throw new PlanningCenterSetupError("That donor wasn't found.");

  // A link made against a different Planning Center organization is meaningless.
  const usable = existing && existing.pcoOrganizationId === pcoOrganizationId ? existing : null;
  if (usable && usable.status === "LINKED") return { status: "LINKED", pcoPersonId: usable.pcoPersonId };
  if (usable && usable.status === "NEEDS_REVIEW") return { status: "NEEDS_REVIEW", pcoPersonId: null };
  if (usable && usable.status === "NO_MATCH" && !options.force && now.getTime() - usable.lastCheckedAt.getTime() < NO_MATCH_RECHECK_MS) {
    return { status: "NO_MATCH", pcoPersonId: null };
  }

  const rejected = new Set(usable?.rejectedPcoPersonIds ?? []);
  const input: MatchDonorInput = { name: donor.name, normalizedEmail: donor.normalizedEmail, normalizedPhone: donor.normalizedPhone };

  const found = await lookupPeople(client, input);
  const ids = [...new Set([...found.byEmail, ...found.byPhone].map((p) => p.id))];
  const linkedElsewhere = await linkedElsewhereFor(churchId, donorId, ids);
  const outcome = decideMatch(input, found, { linkedElsewhere, rejected });
  return persistOutcome(churchId, donorId, pcoOrganizationId, outcome, rejected, now);
}

async function persistOutcome(
  churchId: string,
  donorId: string,
  pcoOrganizationId: string,
  outcome: MatchOutcome,
  rejected: Set<string>,
  now: Date
): Promise<LinkState> {
  const base = { churchId, donorId, pcoOrganizationId, rejectedPcoPersonIds: [...rejected], lastCheckedAt: now };

  if (outcome.kind === "LINKED") {
    try {
      await prisma.planningCenterPersonLink.upsert({
        where: { churchId_donorId: { churchId, donorId } },
        create: { ...base, status: "LINKED", pcoPersonId: outcome.person.id, pcoPersonName: outcome.person.name, matchMethod: outcome.method, matchedAt: now, candidatesJson: Prisma.DbNull },
        update: { ...base, status: "LINKED", pcoPersonId: outcome.person.id, pcoPersonName: outcome.person.name, matchMethod: outcome.method, matchedAt: now, candidatesJson: Prisma.DbNull },
      });
      return { status: "LINKED", pcoPersonId: outcome.person.id };
    } catch (err) {
      // Raced another donor onto the same person: let a human decide.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const candidate: MatchCandidate = { pcoPersonId: outcome.person.id, name: outcome.person.name, emails: outcome.person.emails, phones: outcome.person.phones };
      return persistOutcome(churchId, donorId, pcoOrganizationId, { kind: "NEEDS_REVIEW", candidates: [candidate] }, rejected, now);
    }
  }

  if (outcome.kind === "NEEDS_REVIEW") {
    const data = { ...base, status: "NEEDS_REVIEW", pcoPersonId: null, pcoPersonName: null, matchMethod: null, candidatesJson: outcome.candidates as unknown as Prisma.InputJsonValue };
    await prisma.planningCenterPersonLink.upsert({ where: { churchId_donorId: { churchId, donorId } }, create: data, update: data });
    return { status: "NEEDS_REVIEW", pcoPersonId: null };
  }

  const data = { ...base, status: "NO_MATCH", pcoPersonId: null, pcoPersonName: null, matchMethod: null, candidatesJson: Prisma.DbNull };
  await prisma.planningCenterPersonLink.upsert({ where: { churchId_donorId: { churchId, donorId } }, create: data, update: data });
  return { status: "NO_MATCH", pcoPersonId: null };
}

async function audit(churchId: string, actor: Actor, action: string, donorId: string, metadata?: Record<string, unknown>) {
  await logDashboardAction({
    churchId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType: "PlanningCenterPersonLink",
    entityId: donorId,
    metadata,
    req: actor.req,
  });
}

/** The church picks the person for a donor (from the review list, or by id). */
export async function linkDonorManually(
  churchId: string,
  donorId: string,
  pcoPersonId: string,
  pcoOrganizationId: string,
  client: PlanningCenterClient,
  actor: Actor
): Promise<void> {
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  if (!donor) throw new PlanningCenterSetupError("That donor wasn't found.");

  const person = await getPerson(client, pcoPersonId);
  if (!person) throw new PlanningCenterSetupError("That person no longer exists in Planning Center.");
  if (person.isInactive) throw new PlanningCenterSetupError(`${person.name} is inactive in Planning Center. Choose an active person.`);

  const owner = await prisma.planningCenterPersonLink.findFirst({ where: { churchId, pcoPersonId, status: "LINKED", donorId: { not: donorId } } });
  if (owner) {
    throw new PlanningCenterSetupError(`${person.name} is already linked to a different donor. If those two donors are the same person, merge them first.`);
  }

  const existing = await prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId } } });
  const rejected = (existing?.rejectedPcoPersonIds ?? []).filter((id) => id !== pcoPersonId);
  const now = new Date();
  const data = {
    churchId, donorId, pcoOrganizationId, status: "LINKED", pcoPersonId, pcoPersonName: person.name, matchMethod: "MANUAL",
    candidatesJson: Prisma.DbNull, rejectedPcoPersonIds: rejected, linkedByUserId: actor.userId, matchedAt: now, lastCheckedAt: now,
  };
  try {
    await prisma.planningCenterPersonLink.upsert({ where: { churchId_donorId: { churchId, donorId } }, create: data, update: data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PlanningCenterSetupError(`${person.name} was just linked to another donor. Refresh and try again.`);
    }
    throw err;
  }
  await audit(churchId, actor, "planningcenter.person_linked", donorId, { pcoPersonId, method: "MANUAL" });
}

/** "This isn't the same person": never offered or auto-linked for this donor again. */
export async function rejectCandidate(churchId: string, donorId: string, pcoPersonId: string, actor: Actor): Promise<void> {
  const link = await prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId } } });
  if (!link) throw new PlanningCenterSetupError("There's nothing to review for that donor.");

  const rejected = [...new Set([...link.rejectedPcoPersonIds, pcoPersonId])];
  const remaining = Array.isArray(link.candidatesJson) ? (link.candidatesJson as unknown as MatchCandidate[]).filter((c) => c.pcoPersonId !== pcoPersonId) : [];
  const stillReview = link.status === "NEEDS_REVIEW" && remaining.length > 0;

  await prisma.planningCenterPersonLink.update({
    where: { churchId_donorId: { churchId, donorId } },
    data: stillReview
      ? { rejectedPcoPersonIds: rejected, candidatesJson: remaining as unknown as Prisma.InputJsonValue }
      : { rejectedPcoPersonIds: rejected, status: "NO_MATCH", pcoPersonId: null, pcoPersonName: null, matchMethod: null, candidatesJson: Prisma.DbNull, lastCheckedAt: new Date() },
  });
  await audit(churchId, actor, "planningcenter.person_rejected", donorId, { pcoPersonId });
}

/** Removes a link the church says is wrong; that person is never auto-linked to this donor again. */
export async function unlinkDonor(churchId: string, donorId: string, actor: Actor): Promise<void> {
  const link = await prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId } } });
  if (!link || link.status !== "LINKED") throw new PlanningCenterSetupError("That donor isn't linked.");
  const rejected = link.pcoPersonId ? [...new Set([...link.rejectedPcoPersonIds, link.pcoPersonId])] : link.rejectedPcoPersonIds;
  await prisma.planningCenterPersonLink.update({
    where: { churchId_donorId: { churchId, donorId } },
    data: { status: "NO_MATCH", pcoPersonId: null, pcoPersonName: null, matchMethod: null, candidatesJson: Prisma.DbNull, rejectedPcoPersonIds: rejected, lastCheckedAt: new Date() },
  });
  await audit(churchId, actor, "planningcenter.person_unlinked", donorId, { pcoPersonId: link.pcoPersonId });
}

/**
 * After two donors are merged, the surviving donor inherits the archived
 * donor's link when it has no confirmed one of its own. If both are linked,
 * the survivor's link wins and the other stays on the archived donor.
 * Best-effort by design: a failure here must never affect the merge, and the
 * worst outcome is that the survivor is simply matched again later.
 */
export async function moveLinkOnDonorMerge(churchId: string, archivedDonorId: string, survivorDonorId: string): Promise<void> {
  try {
    const [archived, survivor] = await Promise.all([
      prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId: archivedDonorId } } }),
      prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId: survivorDonorId } } }),
    ]);
    if (!archived || archived.status !== "LINKED") return;
    if (survivor && survivor.status === "LINKED") return;

    await prisma.$transaction([
      ...(survivor ? [prisma.planningCenterPersonLink.delete({ where: { id: survivor.id } })] : []),
      prisma.planningCenterPersonLink.update({ where: { id: archived.id }, data: { donorId: survivorDonorId } }),
    ]);
  } catch (err) {
    console.error("planning-center: could not move person link after donor merge:", err instanceof Error ? err.message : err);
  }
}
