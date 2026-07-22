import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "./requireMerchantSession";
import type { ResolvedViewScope, ViewScope } from "./viewScope";

/**
 * Checkpoint 4: now that GivingLink.ownerUserId, Payment.attributedUserId,
 * and FinixSubscription.attributedUserId are real, snapshotted-at-creation
 * columns (Checkpoint 3), these builders filter directly on them. No more
 * GivingLink joins to approximate payment/subscription ownership, and no
 * live re-derivation from the giving link's *current* owner — a
 * reassignment changes future attribution only, and these scope builders
 * must reflect that: they read the stored snapshot, never the link.
 */

// Request-level cached payment lookup to prevent duplicate database hits when building scopes
export const getOwnPaymentTransferIds = cache(async (churchId: string, attributedUserId: string): Promise<string[]> => {
  const ownPayments = await prisma.payment.findMany({
    where: { churchId, attributedUserId },
    select: { finixTransferId: true },
  });
  return ownPayments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
});

/**
 * The two giving links flagged in the Checkpoint 3 backfill report as
 * cross-church data-quality issues (created under a churchId that doesn't
 * match their createdByUserId's actual church — see that report for detail).
 * Their ownerUserId was deliberately left null and must stay that way; this
 * constant exists so any future backfill/reassignment/reporting code has an
 * explicit, named reason not to "fix" them by inference. Reassignment is
 * already blocked structurally today (validateGivingLinkReassignment
 * requires a same-church target, and both links' churches currently have
 * zero users), but this stays in place as the record of intent in case
 * that structural protection ever changes.
 */
export const QUARANTINED_GIVING_LINK_IDS: readonly string[] = [
  "cmregqdeh000087fp7sej7apu", // "QEGWRG" — church "balaji"
  "cmrjg41l50000co7e5posgrk6", // "kkk" — church "aaa"
];

export function resolveTargetUserId(auth: MerchantAuthContext, viewScope: ViewScope | ResolvedViewScope): string {
  const scope = "effective" in viewScope ? viewScope.effective : viewScope;
  if (scope.kind === "user") return scope.userId;
  return auth.userId;
}

/** FUNDRAISER can never see anyone else's data, no matter what view scope
 * was requested — this is enforced independently of resolveViewScope() (which
 * already collapses to "currentUser" for anyone without canViewAsUser) as a
 * second, defense-in-depth check specific to these scope builders. */
export function isForcedToOwnData(auth: MerchantAuthContext): boolean {
  return auth.role === "fundraiser";
}

/** Returns the scopedUserId for a user-specific scope, or null for
 * organization scope — the single decision point every scope builder in
 * this file (and buildFinixTransferScope/buildDonorScope) uses, so "is this
 * an org-wide or a specific-user view" is answered identically everywhere. */
export function resolveScopedUserId(auth: MerchantAuthContext, viewScope: ViewScope | ResolvedViewScope): string | null {
  if (isForcedToOwnData(auth)) return auth.userId;
  const scope = "effective" in viewScope ? viewScope.effective : viewScope;
  if (scope.kind === "organization") return null;
  return resolveTargetUserId(auth, viewScope);
}

export function buildGivingLinkScope(
  auth: MerchantAuthContext,
  viewScope: ViewScope | ResolvedViewScope
): Prisma.GivingLinkWhereInput {
  const scope = "effective" in viewScope ? viewScope.effective : viewScope;

  if (isForcedToOwnData(auth) || scope.kind !== "organization") {
    const userId = isForcedToOwnData(auth) ? auth.userId : resolveTargetUserId(auth, viewScope);
    // ownerUserId is the Checkpoint 3 snapshot field — quarantined/unowned
    // links (ownerUserId: null) never match a real userId here, so they're
    // excluded from every user-specific scope without needing an explicit
    // NOT IN clause. Organization scope (below) intentionally still
    // includes them — that's the "organization-level... data-quality view"
    // the approved plan calls for.
    return { churchId: auth.churchId, ownerUserId: userId };
  }
  return { churchId: auth.churchId };
}

export function buildPaymentScope(
  auth: MerchantAuthContext,
  viewScope: ViewScope | ResolvedViewScope
): Prisma.PaymentWhereInput {
  const scope = "effective" in viewScope ? viewScope.effective : viewScope;

  // Organization scope explicitly includes unattributed payments
  // (attributedUserId: null) — per the approved read-scope rules, "all
  // church payments, including unattributed payments."
  if (!isForcedToOwnData(auth) && scope.kind === "organization") {
    return { churchId: auth.churchId };
  }

  const userId = isForcedToOwnData(auth) ? auth.userId : resolveTargetUserId(auth, viewScope);
  // A user-specific scope must exclude unattributed data (attributedUserId:
  // null never equals a specific userId), which also naturally excludes
  // payments through the quarantined giving links above — they're
  // unattributed by construction.
  return { churchId: auth.churchId, attributedUserId: userId };
}

export function buildSubscriptionScope(
  auth: MerchantAuthContext,
  viewScope: ViewScope | ResolvedViewScope
): Prisma.FinixSubscriptionWhereInput {
  const scope = "effective" in viewScope ? viewScope.effective : viewScope;

  if (isForcedToOwnData(auth) || scope.kind !== "organization") {
    const userId = isForcedToOwnData(auth) ? auth.userId : resolveTargetUserId(auth, viewScope);
    return { churchId: auth.churchId, attributedUserId: userId };
  }
  return { churchId: auth.churchId };
}

/**
 * Checkpoint 4A: the Transactions > Payments list/detail/export surface is
 * built on `FinixTransfer` (Finix's raw processor-mirror table), not
 * `Payment` (WGC's donation record, which is what actually carries
 * attributedUserId) — the two are joined by finixTransferId. This bridges
 * a user-scoped view down to the set of finixTransferIds that user's
 * Payment rows reference, so FinixTransfer queries can be scoped without
 * adding attribution to a second table. Organization scope skips the
 * lookup entirely (still just churchId, including unattributed transfers).
 */
export async function buildFinixTransferScope(
  auth: MerchantAuthContext,
  viewScope: ViewScope | ResolvedViewScope
): Promise<Prisma.FinixTransferWhereInput> {
  const scopedUserId = resolveScopedUserId(auth, viewScope);
  if (scopedUserId === null) {
    return { churchId: auth.churchId };
  }
  const transferIds = await getOwnPaymentTransferIds(auth.churchId, scopedUserId);
  // No matching transfer IDs -> deliberately return an impossible filter
  // rather than an empty `in: []` (Prisma treats `in: []` as "match
  // nothing" too, but being explicit here avoids relying on that subtlety).
  if (transferIds.length === 0) {
    return { churchId: auth.churchId, id: "__no_match__" };
  }
  return { churchId: auth.churchId, finixTransferId: { in: transferIds } };
}

/**
 * Checkpoint 4B: refunds (`FinixRefundOrReversal`) are a third Finix-mirror
 * table with no attribution of its own — related to a Payment via
 * finixOriginalTransferId -> FinixTransfer.finixTransferId ->
 * Payment.finixTransferId. Same bridging approach as
 * buildFinixTransferScope, just filtering on finixOriginalTransferId
 * instead of finixTransferId.
 */
export async function buildRefundScope(
  auth: MerchantAuthContext,
  viewScope: ViewScope | ResolvedViewScope
): Promise<Prisma.FinixRefundOrReversalWhereInput> {
  const scopedUserId = resolveScopedUserId(auth, viewScope);
  if (scopedUserId === null) {
    return { churchId: auth.churchId };
  }
  const transferIds = await getOwnPaymentTransferIds(auth.churchId, scopedUserId);
  if (transferIds.length === 0) {
    return { churchId: auth.churchId, id: "__no_match__" };
  }
  return { churchId: auth.churchId, finixOriginalTransferId: { in: transferIds } };
}

/**
 * Checkpoint 4A donor scoping: Donor has no ownerUserId/attributedUserId
 * (per the approved spec — a donor can give through multiple team members'
 * links). A donor is visible in a user-specific scope only if they have at
 * least one Payment or FinixSubscription attributed to that user.
 * Organization scope returns null (no additional donorId filter needed —
 * caller should just scope by churchId).
 */
export async function resolveScopedDonorIds(
  auth: MerchantAuthContext,
  viewScope: ViewScope | ResolvedViewScope
): Promise<string[] | null> {
  const scopedUserId = resolveScopedUserId(auth, viewScope);
  if (scopedUserId === null) return null;

  const [paymentDonors, subscriptionDonors] = await Promise.all([
    prisma.payment.findMany({
      where: { churchId: auth.churchId, attributedUserId: scopedUserId, donorId: { not: null } },
      select: { donorId: true },
      distinct: ["donorId"],
    }),
    prisma.finixSubscription.findMany({
      where: { churchId: auth.churchId, attributedUserId: scopedUserId, donorId: { not: null } },
      select: { donorId: true },
      distinct: ["donorId"],
    }),
  ]);

  const ids = new Set<string>();
  for (const p of paymentDonors) if (p.donorId) ids.add(p.donorId);
  for (const s of subscriptionDonors) if (s.donorId) ids.add(s.donorId);
  return Array.from(ids);
}
