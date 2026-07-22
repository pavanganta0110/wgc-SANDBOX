import { prisma } from "@/lib/prisma";
import { loadDonorAggregatesBatch } from "@/lib/donors/donorAggregates";

export interface DuplicateDonorGroupMember {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  paymentCount: number;
  subscriptionCount: number;
  totalDonatedCents: number;
  firstDonationAt: Date | null;
  lastDonationAt: Date | null;
  hasActiveSubscription: boolean;
}

export interface DuplicateDonorGroup {
  churchId: string;
  normalizedEmail: string;
  donors: DuplicateDonorGroupMember[];
  proposedCanonicalDonorId: string;
  proposedMergeDonorIds: string[];
  conflicts: string[];
}

/**
 * Read-only church-wide duplicate report — groups every active (non-
 * archived) donor by churchId + normalizedEmail and, for every group with
 * more than one donor, proposes a canonical survivor. This never writes
 * anything; it's the preview step that must be reviewed before mergeDonors
 * is ever called on live data.
 *
 * Canonical selection, in priority order (per spec):
 *   1. Donor with an active subscription
 *   2. Donor with the most linked records (payments + subscriptions)
 *   3. Earliest created donor
 *   4. Most complete profile (has both email and phone) as the final tiebreak
 */
export async function findDuplicateDonorGroups(churchId: string): Promise<DuplicateDonorGroup[]> {
  const donors = await prisma.donor.findMany({
    where: { churchId, archivedAt: null, normalizedEmail: { not: null } },
    orderBy: { createdAt: "asc" },
  });

  const byEmail = new Map<string, typeof donors>();
  for (const d of donors) {
    const key = d.normalizedEmail!;
    const list = byEmail.get(key) ?? [];
    list.push(d);
    byEmail.set(key, list);
  }

  const duplicateGroups = [...byEmail.entries()].filter(([, group]) => group.length > 1);
  if (duplicateGroups.length === 0) return [];

  const allDonorIds = duplicateGroups.flatMap(([, group]) => group.map((d) => d.id));
  const aggregatesMap = await loadDonorAggregatesBatch(allDonorIds, churchId);

  const subscriptionCounts = await prisma.finixSubscription.groupBy({
    by: ["donorId"],
    where: { churchId, donorId: { in: allDonorIds } },
    _count: { _all: true },
  });
  const subscriptionCountByDonor = new Map(subscriptionCounts.map((s) => [s.donorId!, s._count._all]));

  const paymentCounts = await prisma.payment.groupBy({
    by: ["donorId"],
    where: { churchId, donorId: { in: allDonorIds } },
    _count: { _all: true },
  });
  const paymentCountByDonor = new Map(paymentCounts.map((p) => [p.donorId!, p._count._all]));

  return duplicateGroups.map(([normalizedEmail, group]) => {
    const members: DuplicateDonorGroupMember[] = group.map((d) => {
      const agg = aggregatesMap.get(d.id)!;
      return {
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        createdAt: d.createdAt,
        paymentCount: paymentCountByDonor.get(d.id) ?? 0,
        subscriptionCount: subscriptionCountByDonor.get(d.id) ?? 0,
        totalDonatedCents: agg.totalDonatedCents,
        firstDonationAt: agg.firstDonationAt,
        lastDonationAt: agg.lastDonationAt,
        hasActiveSubscription: agg.activeSubscriptionCount > 0,
      };
    });

    const canonical = [...members].sort((a, b) => {
      if (a.hasActiveSubscription !== b.hasActiveSubscription) return a.hasActiveSubscription ? -1 : 1;
      const aLinked = a.paymentCount + a.subscriptionCount;
      const bLinked = b.paymentCount + b.subscriptionCount;
      if (aLinked !== bLinked) return bLinked - aLinked;
      if (a.createdAt.getTime() !== b.createdAt.getTime()) return a.createdAt.getTime() - b.createdAt.getTime();
      const aComplete = Number(Boolean(a.email)) + Number(Boolean(a.phone));
      const bComplete = Number(Boolean(b.email)) + Number(Boolean(b.phone));
      return bComplete - aComplete;
    })[0];

    const conflicts: string[] = [];
    const namesWithoutGeneric = new Set(members.map((m) => (m.name || "").trim().toLowerCase()).filter(Boolean));
    if (namesWithoutGeneric.size > 1) conflicts.push("Donors in this group have different names on file");
    const phones = new Set(members.map((m) => m.phone).filter(Boolean));
    if (phones.size > 1) conflicts.push("Donors in this group have different phone numbers on file");

    return {
      churchId,
      normalizedEmail,
      donors: members,
      proposedCanonicalDonorId: canonical.id,
      proposedMergeDonorIds: members.filter((m) => m.id !== canonical.id).map((m) => m.id),
      conflicts,
    };
  });
}

export interface DuplicateCandidate {
  donor: { id: string; name: string | null; email: string | null; phone: string | null; createdAt: Date };
  matchedOn: string[];
}

/**
 * Matches on normalized email, normalized phone, or shared external
 * identity ID — never on name alone, per the explicit instruction not to
 * flag duplicates from name similarity. Excludes archived/already-merged
 * donors and always stays within one organization.
 */
export async function findPossibleDuplicates(donorId: string, churchId: string): Promise<DuplicateCandidate[]> {
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  if (!donor) return [];

  const orConditions: any[] = [];
  if (donor.normalizedEmail) orConditions.push({ normalizedEmail: donor.normalizedEmail });
  if (donor.normalizedPhone) orConditions.push({ normalizedPhone: donor.normalizedPhone });
  if (donor.finixIdentityId) orConditions.push({ finixIdentityId: donor.finixIdentityId });

  if (orConditions.length === 0) return [];

  const candidates = await prisma.donor.findMany({
    where: {
      churchId,
      id: { not: donorId },
      archivedAt: null,
      OR: orConditions,
    },
  });

  return candidates.map((c) => {
    const matchedOn: string[] = [];
    if (donor.normalizedEmail && c.normalizedEmail === donor.normalizedEmail) matchedOn.push("Email");
    if (donor.normalizedPhone && c.normalizedPhone === donor.normalizedPhone) matchedOn.push("Phone");
    if (donor.finixIdentityId && c.finixIdentityId === donor.finixIdentityId) matchedOn.push("External Identity");
    return { donor: { id: c.id, name: c.name, email: c.email, phone: c.phone, createdAt: c.createdAt }, matchedOn };
  });
}

export interface MergeResult {
  primaryDonorId: string;
  archivedDonorId: string;
  reassigned: {
    payments: number;
    paymentAttempts: number;
    instruments: number;
    notes: number;
    subscriptions: number;
    subscriptionConsents: number;
    subscriptionSetupLinks: number;
    statements: number;
  };
  /** AnnualDonationStatement rows left on the archived donor because the
   * primary already has one for the same (taxYear, version) — never
   * silently dropped, always the caller's job to review and resolve. */
  statementConflicts: number;
}

/**
 * Reassigns every local relationship from the duplicate donor to the
 * primary donor, transactionally, then archives the duplicate (never hard-
 * deleted — its financial history stays attached, just re-owned by the
 * primary). Both donors must belong to the same organization, and a donor
 * can never be merged into itself.
 */
export async function mergeDonors(primaryDonorId: string, duplicateDonorId: string, churchId: string, actorUserId: string | null, actorEmail: string | null): Promise<MergeResult> {
  if (primaryDonorId === duplicateDonorId) {
    throw new Error("Cannot merge a donor into itself");
  }

  const [primary, duplicate] = await Promise.all([
    prisma.donor.findFirst({ where: { id: primaryDonorId, churchId } }),
    prisma.donor.findFirst({ where: { id: duplicateDonorId, churchId } }),
  ]);
  if (!primary || !duplicate) {
    throw new Error("Both donors must belong to the same organization");
  }

  const result = await prisma.$transaction(async (tx) => {
    const payments = await tx.payment.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });
    const paymentAttempts = await tx.paymentAttempt.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });
    const instruments = await tx.finixPaymentInstrumentSnapshot.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });
    const notes = await tx.donorNote.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });
    const subscriptions = await tx.finixSubscription.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });
    const subscriptionConsents = await tx.subscriptionConsent.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });
    const subscriptionSetupLinks = await tx.subscriptionSetupLink.updateMany({ where: { donorId: duplicateDonorId, churchId }, data: { donorId: primaryDonorId } });

    // AnnualDonationStatement is unique on (donorId, taxYear, version) — a
    // plain updateMany would throw if the primary already has one for the
    // same year/version, so these are reassigned one at a time and any
    // collision is left on the archived donor (never dropped) and counted
    // as a conflict for the caller to resolve manually.
    const duplicateStatements = await tx.annualDonationStatement.findMany({ where: { donorId: duplicateDonorId, churchId } });
    let statementsMoved = 0;
    let statementConflicts = 0;
    for (const statement of duplicateStatements) {
      const conflict = await tx.annualDonationStatement.findFirst({
        where: { donorId: primaryDonorId, taxYear: statement.taxYear, version: statement.version },
      });
      if (conflict) {
        statementConflicts += 1;
        continue;
      }
      await tx.annualDonationStatement.update({ where: { id: statement.id }, data: { donorId: primaryDonorId } });
      statementsMoved += 1;
    }

    await tx.donor.update({
      where: { id: duplicateDonorId },
      data: {
        archivedAt: new Date(),
        archivedByUserId: actorUserId,
        archivedByEmail: actorEmail,
        mergedIntoDonorId: primaryDonorId,
        mergedAt: new Date(),
      },
    });

    // Backfill contact fields on the primary if it's missing something the
    // duplicate had — never overwrite a populated primary value.
    const fillIn: Record<string, unknown> = {};
    if (!primary.email && duplicate.email) {
      fillIn.email = duplicate.email;
      fillIn.normalizedEmail = duplicate.normalizedEmail;
    }
    if (!primary.phone && duplicate.phone) {
      fillIn.phone = duplicate.phone;
      fillIn.normalizedPhone = duplicate.normalizedPhone;
    }
    // finixIdentityId is @unique — the duplicate's value must be cleared in
    // the same transaction before the primary can take it, or the update
    // below would collide with the constraint (both rows briefly sharing it).
    if (!primary.finixIdentityId && duplicate.finixIdentityId) {
      await tx.donor.update({ where: { id: duplicateDonorId }, data: { finixIdentityId: null } });
      fillIn.finixIdentityId = duplicate.finixIdentityId;
    }
    if (Object.keys(fillIn).length > 0) {
      await tx.donor.update({ where: { id: primaryDonorId }, data: fillIn });
    }

    return {
      primaryDonorId,
      archivedDonorId: duplicateDonorId,
      reassigned: {
        payments: payments.count,
        paymentAttempts: paymentAttempts.count,
        instruments: instruments.count,
        notes: notes.count,
        subscriptions: subscriptions.count,
        subscriptionConsents: subscriptionConsents.count,
        subscriptionSetupLinks: subscriptionSetupLinks.count,
        statements: statementsMoved,
      },
      statementConflicts,
    };
  });

  return result;
}
