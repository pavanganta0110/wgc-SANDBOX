import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

/**
 * Names Finix/wallet sheets hand back when the donor never typed a real
 * name into the giving form — these must never overwrite a meaningful
 * name already on a donor profile, and should themselves be treated as
 * "no name" when deciding whether to update one.
 */
const GENERIC_DONOR_NAMES = new Set(["card holder name", "google pay user", "apple pay user", "unknown"]);

function isMeaningfulName(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return false;
  return !GENERIC_DONOR_NAMES.has(trimmed.toLowerCase());
}

export interface DonorResolutionInput {
  churchId: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  /** Finix identity this donation/subscription is tied to, if any — checked first since it's an exact, already-established link. */
  finixIdentityId?: string | null;
  /** Address metadata, where already available (e.g. donor CSV import) — filled on create, and on an existing match only when the donor doesn't already have a value. */
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  companyName?: string | null;
}

/**
 * The single source of truth for "which Donor row does this person map
 * to" — every payment/subscription creation path (public checkout: card,
 * ACH, Apple Pay, Google Pay, recurring; admin Take a Payment) must call
 * this instead of maintaining its own donor-matching logic.
 *
 * Canonical identity within a church is normalizedEmail (trimmed,
 * lowercased). finixIdentityId is checked first only because it's an
 * exact link already recorded on a previous donation; it is not itself
 * the identity — a person's card/wallet naturally issues a new Finix
 * identity on almost every checkout, which is exactly what caused the
 * duplicate-donor bug this resolver fixes (each new identity used to get
 * its own `donor.upsert({ where: { finixIdentityId } })`, which can never
 * match an existing row for a *new* identity). When no email is
 * available, a normalized phone may be used as a fallback match — but
 * only within the same church, and never a bare name match.
 *
 * Concurrency note: without a DB-level unique constraint on
 * (churchId, normalizedEmail) — deliberately not added until existing
 * duplicates are merged (see donorMerge.ts) — two simultaneous donations
 * from a brand-new donor can still race between the lookup and the
 * create. The retry below closes that window for the common case (a
 * second identical donation lands moments later and a duplicate row was
 * unique-constrained on finixIdentityId), but is not a full guarantee
 * until the normalizedEmail constraint exists.
 */
export async function resolveOrCreateDonor(input: DonorResolutionInput): Promise<{ id: string; created: boolean; updated: boolean }> {
  const { churchId } = input;
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = normalizePhone(input.phone);
  const name = input.name?.trim() || null;

  const profileUpdate: ProfileUpdateInput = {
    name,
    email: input.email,
    phone: input.phone,
    normalizedEmail,
    normalizedPhone,
    finixIdentityId: input.finixIdentityId,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.country,
    companyName: input.companyName,
  };

  const existing = await findExistingDonor(churchId, input.finixIdentityId, normalizedEmail, normalizedPhone);
  if (existing) {
    const result = await applyProfileUpdates(existing, profileUpdate);
    return { id: result.id, created: false, updated: result.changed };
  }

  try {
    const created = await prisma.donor.create({
      data: {
        churchId,
        name,
        email: input.email || null,
        normalizedEmail,
        phone: input.phone || null,
        normalizedPhone,
        finixIdentityId: input.finixIdentityId || null,
        addressLine1: input.addressLine1 || null,
        addressLine2: input.addressLine2 || null,
        city: input.city || null,
        state: input.state || null,
        postalCode: input.postalCode || null,
        country: input.country || null,
        companyName: input.companyName || null,
      },
    });
    return { id: created.id, created: true, updated: false };
  } catch (err) {
    // A concurrent request resolved the same donor between our lookup and
    // this create (most likely finixIdentityId's existing @unique
    // constraint firing on a race). Re-resolve instead of failing the
    // donation — the other request's row is the real canonical donor.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const retry = await findExistingDonor(churchId, input.finixIdentityId, normalizedEmail, normalizedPhone);
      if (retry) {
        const result = await applyProfileUpdates(retry, profileUpdate);
        return { id: result.id, created: false, updated: result.changed };
      }
    }
    throw err;
  }
}

async function findExistingDonor(
  churchId: string,
  finixIdentityId: string | null | undefined,
  normalizedEmail: string | null,
  normalizedPhone: string | null
) {
  if (finixIdentityId) {
    const byIdentity = await prisma.donor.findFirst({ where: { finixIdentityId, churchId } });
    if (byIdentity) return byIdentity;
  }
  if (normalizedEmail) {
    const byEmail = await prisma.donor.findFirst({ where: { churchId, archivedAt: null, normalizedEmail } });
    if (byEmail) return byEmail;
  }
  // Phone is only a fallback identity when email is unavailable — never
  // used to override or merge an email-matched donor.
  if (!normalizedEmail && normalizedPhone) {
    const byPhone = await prisma.donor.findFirst({ where: { churchId, archivedAt: null, normalizedPhone } });
    if (byPhone) return byPhone;
  }
  return null;
}

interface ProfileUpdateInput {
  name: string | null;
  email?: string | null;
  phone?: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  finixIdentityId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  companyName?: string | null;
}

const FILL_WHEN_EMPTY_FIELDS = ["addressLine1", "addressLine2", "city", "state", "postalCode", "country", "companyName"] as const;

/**
 * Updates only the fields it's safe to update on an existing match —
 * never regresses a real name to a generic wallet placeholder, never
 * overwrites a populated email/phone, and only backfills finixIdentityId
 * when the donor doesn't already have one linked (it's @unique, so at
 * most one identity can ever be attached to a given donor row).
 */
async function applyProfileUpdates(
  existing: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    normalizedEmail: string | null;
    normalizedPhone: string | null;
    finixIdentityId: string | null;
  } & Partial<Record<(typeof FILL_WHEN_EMPTY_FIELDS)[number], string | null>>,
  update: ProfileUpdateInput
): Promise<{ id: string; changed: boolean }> {
  const data: Record<string, unknown> = {};

  if (!isMeaningfulName(existing.name) && isMeaningfulName(update.name)) {
    data.name = update.name;
  }
  if (!existing.email && update.email) {
    data.email = update.email;
    data.normalizedEmail = update.normalizedEmail;
  }
  if (!existing.phone && update.phone) {
    data.phone = update.phone;
    data.normalizedPhone = update.normalizedPhone;
  }
  if (!existing.finixIdentityId && update.finixIdentityId) {
    data.finixIdentityId = update.finixIdentityId;
  }
  for (const field of FILL_WHEN_EMPTY_FIELDS) {
    if (!existing[field] && update[field]) {
      data[field] = update[field];
    }
  }

  if (Object.keys(data).length === 0) return { id: existing.id, changed: false };

  try {
    const updated = await prisma.donor.update({ where: { id: existing.id }, data });
    return { id: updated.id, changed: true };
  } catch (err) {
    // finixIdentityId collided with another donor's link (shouldn't
    // happen given the @unique lookup above, but never fail the donation
    // over a non-essential profile backfill).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { id: existing.id, changed: false };
    }
    throw err;
  }
}
