import { prisma } from "@/lib/prisma";
import { resolveOrCreateDonor, type DonorResolutionInput } from "@/lib/donors/resolveOrCreateDonor";
import { findBestScoredMatch, type MatchCandidateDonor } from "@/lib/donors/donorMatchConfidence";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { DONOR_CANDIDATE_CAP } from "@/lib/donors/donorsList";

export type PossibleMatchSourceType = "EXTERNAL_DONATION_ENTRY" | "EXTERNAL_DONATION_IMPORT";

export interface ResolveWithMatchReviewInput extends DonorResolutionInput {
  sourceType: PossibleMatchSourceType;
  sourceId?: string;
  donationAmountCents?: number;
  donationDate?: Date;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}

export interface ResolveWithMatchReviewResult {
  id: string;
  created: boolean;
  updated: boolean;
  /** Set only when a new donor was created AND a MEDIUM-confidence possible
   * match was raised against an existing donor for human review. */
  possibleMatchId?: string;
}

/**
 * The merchant-side counterpart to resolveOrCreateDonor, used only by the
 * External Donation manual-entry and CSV-import paths (never the public
 * Finix checkout — see donorMatchConfidence.ts doc comment for why).
 * Exact-match resolution (email/phone/finixIdentityId) behaves identically
 * to resolveOrCreateDonor — that is unchanged and still auto-attaches
 * without any review step, exactly as the spec requires for HIGH
 * confidence. The only addition: when resolveOrCreateDonor had to create a
 * brand-new donor (no exact match), this scans a bounded pool of existing
 * donors for a MEDIUM-confidence fuzzy match and, if found, raises a
 * PossibleDonorMatch row for a human to confirm or reject — without
 * blocking or delaying the donation itself, which always records against
 * the newly-created donor immediately.
 */
export async function resolveOrCreateDonorWithMatchReview(input: ResolveWithMatchReviewInput): Promise<ResolveWithMatchReviewResult> {
  const { sourceType, sourceId, donationAmountCents, donationDate, actorUserId, actorEmail, actorRole, req, ...resolutionInput } = input;

  const resolved = await resolveOrCreateDonor(resolutionInput);

  if (!resolved.created) {
    // Exact match — HIGH confidence, auto-attached, same as always.
    await logDashboardAction({
      churchId: input.churchId,
      actorUserId: actorUserId ?? undefined,
      actorEmail: actorEmail ?? undefined,
      actorRole: actorRole ?? undefined,
      action: "donor.auto_matched",
      entityType: "donor",
      entityId: resolved.id,
      metadata: { confidence: "HIGH", method: "exact_identifier", sourceType, sourceId },
      req,
    });
    return resolved;
  }

  // A brand-new donor was just created — scan for a fuzzy MEDIUM match
  // against the existing roster before we consider this donation fully
  // resolved. Bounded candidate pool mirrors DONOR_CANDIDATE_CAP, the same
  // bound donorSummary.ts already uses for classification work that has no
  // single-query SQL form.
  const candidates = await prisma.donor.findMany({
    where: { churchId: input.churchId, archivedAt: null, id: { not: resolved.id } },
    select: {
      id: true,
      name: true,
      email: true,
      normalizedEmail: true,
      phone: true,
      normalizedPhone: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      finixIdentityId: true,
    },
    take: DONOR_CANDIDATE_CAP,
    orderBy: { createdAt: "desc" },
  });

  const best = findBestScoredMatch(candidates as MatchCandidateDonor[], {
    name: input.name,
    email: input.email,
    phone: input.phone,
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
  });

  if (!best) return resolved;

  const possibleMatch = await prisma.possibleDonorMatch.create({
    data: {
      churchId: input.churchId,
      existingDonorId: best.donor.id,
      candidateDonorId: resolved.id,
      sourceType,
      sourceId: sourceId ?? null,
      confidence: best.match.confidence,
      confidenceScore: best.match.score,
      matchedFields: best.match.matchedFields,
      conflictingFields: best.match.conflictingFields,
      matchReason: best.match.reason,
      donationAmountCents: donationAmountCents ?? null,
      donationDate: donationDate ?? null,
      status: "PENDING",
    },
  });

  await logDashboardAction({
    churchId: input.churchId,
    actorUserId: actorUserId ?? undefined,
    actorEmail: actorEmail ?? undefined,
    actorRole: actorRole ?? undefined,
    action: "donor.possible_match_created",
    entityType: "donor",
    entityId: resolved.id,
    metadata: {
      possibleMatchId: possibleMatch.id,
      existingDonorId: best.donor.id,
      confidence: best.match.confidence,
      confidenceScore: best.match.score,
      matchedFields: best.match.matchedFields,
      matchReason: best.match.reason,
      sourceType,
      sourceId,
    },
    req,
  });

  return { ...resolved, possibleMatchId: possibleMatch.id };
}
