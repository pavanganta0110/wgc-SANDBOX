import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Webhook-primary, this-is-the-self-healing-fallback pattern (mirrors
 * settlementFundingSync.ts / reconcilePendingPayoutAccountsForChurch) — a
 * subscription's nextBillingDate/state must never be permanently stale just
 * because a subscription.updated webhook was delayed or never delivered.
 */
export const SUBSCRIPTION_RECONCILE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export function isStaleEnoughToReconcile(lastReconciledAt: Date | null | undefined): boolean {
  return !lastReconciledAt || Date.now() - lastReconciledAt.getTime() > SUBSCRIPTION_RECONCILE_THROTTLE_MS;
}

/** A subscription whose nextBillingDate has already passed while it's still reported ACTIVE needs reconciling — its schedule may have advanced on Finix's side with no webhook ever received. */
export function needsReconciliation(sub: { state: string | null; nextBillingDate: Date | null; lastReconciledAt: Date | null }): boolean {
  if (sub.state !== "ACTIVE") return false;
  if (!isStaleEnoughToReconcile(sub.lastReconciledAt)) return false;
  if (!sub.nextBillingDate) return true;
  return sub.nextBillingDate.getTime() <= Date.now();
}

export interface SubscriptionReconcileResult {
  reconciled: boolean;
  donorLinked: boolean;
  error?: string;
}

export interface DonorLinkageResolution {
  donorId: string | null;
  needsDonorMatching: boolean;
}

/**
 * Pure donor-resolution decision — never guesses by name, only trusts an
 * already-known donorId or the donor already linked to the same payment
 * instrument. Every other case is left unlinked and flagged for an
 * authorized admin to resolve manually (spec: "ambiguous donor match must
 * not produce an automatic incorrect match").
 */
export function resolveDonorLinkage(
  local: { donorId: string | null; needsDonorMatching: boolean },
  instrumentDonorId: string | null,
): DonorLinkageResolution {
  if (local.donorId) return { donorId: local.donorId, needsDonorMatching: false };
  if (instrumentDonorId) return { donorId: instrumentDonorId, needsDonorMatching: false };
  return { donorId: null, needsDonorMatching: true };
}

/**
 * Re-fetches one subscription directly from Finix and syncs local state —
 * never trusts a manually-computed "add one interval" date, only what
 * Finix's own schedule response reports. Donor linkage is only ever
 * improved (resolved via the payment instrument snapshot when still
 * missing), never overwritten or guessed from a name.
 */
export async function reconcileSubscription(finixSubscriptionId: string): Promise<SubscriptionReconcileResult> {
  try {
    const local = await prisma.finixSubscription.findUnique({ where: { finixSubscriptionId } });
    if (!local) return { reconciled: false, donorLinked: false, error: "Subscription not found locally" };

    const remote = await finixClient.getSubscription(finixSubscriptionId);

    let instrumentDonorId: string | null = null;
    if (!local.donorId && local.finixPaymentInstrumentId) {
      const instrument = await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: local.finixPaymentInstrumentId },
        select: { donorId: true },
      });
      instrumentDonorId = instrument?.donorId ?? null;
    }
    const { donorId, needsDonorMatching } = resolveDonorLinkage(
      { donorId: local.donorId, needsDonorMatching: local.needsDonorMatching },
      instrumentDonorId,
    );

    await prisma.finixSubscription.update({
      where: { finixSubscriptionId },
      data: {
        donorId: donorId ?? undefined,
        needsDonorMatching,
        state: remote.state ?? local.state ?? undefined,
        amountCents: remote.amount ?? local.amountCents ?? undefined,
        billingInterval: remote.billing_interval ?? local.billingInterval ?? undefined,
        nextBillingDate: parseFinixDate(remote.next_billing_date) ?? undefined,
        canceledAt: remote.canceled_at ? new Date(remote.canceled_at) : local.canceledAt,
        rawJsonRedacted: redactFinixPayload(remote),
        updatedAtFinix: remote.updated_at ? new Date(remote.updated_at) : local.updatedAtFinix,
        lastSyncedAt: new Date(),
        lastReconciledAt: new Date(),
      },
    });

    return { reconciled: true, donorLinked: Boolean(donorId) };
  } catch (err) {
    console.error(`Subscription reconciliation failed for ${finixSubscriptionId}:`, err);
    return { reconciled: false, donorLinked: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bounded, throttled reconciliation pass for a church's active subscriptions
 * whose schedule looks stale — called from page loads (Subscriptions,
 * Recurring Donors, subscription detail) rather than an unbounded background
 * sweep, so a merchant sees corrected data on their next view without
 * needing a deployment or manual intervention.
 */
export async function reconcileStaleActiveSubscriptions(churchId: string, limit = 25): Promise<{ checked: number; reconciled: number }> {
  const candidates = await prisma.finixSubscription.findMany({
    where: { churchId, state: "ACTIVE" },
    select: { finixSubscriptionId: true, state: true, nextBillingDate: true, lastReconciledAt: true },
    take: 200,
  });

  const stale = candidates.filter(needsReconciliation).slice(0, limit);
  if (stale.length === 0) return { checked: candidates.length, reconciled: 0 };

  const results = await Promise.allSettled(stale.map((s) => reconcileSubscription(s.finixSubscriptionId)));
  const reconciled = results.filter((r) => r.status === "fulfilled" && r.value.reconciled).length;
  return { checked: candidates.length, reconciled };
}
