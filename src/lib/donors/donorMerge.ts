import { prisma } from "@/lib/prisma";

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
  };
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
      },
    };
  });

  return result;
}
