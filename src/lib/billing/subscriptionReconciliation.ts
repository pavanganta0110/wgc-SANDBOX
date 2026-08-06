import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { getWgcBillingMerchantId } from "@/lib/billing/wgcBillingConfig";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Reconciles WGC platform subscriptions against Finix's own state —
 * idempotent, organization-scoped, uses only trusted stored Finix
 * identifiers (WgcSubscription.finixSubscriptionId), and NEVER creates a
 * new charge or a second subscription merely because a webhook was
 * missing/delayed — this only re-reads Finix and corrects drifted local
 * fields (trial dates, next-charge date, state).
 *
 * Merchant-routing mismatches are flagged as critical, never silently
 * "repaired" — per the explicit requirement that a WGC subscription routed
 * through the wrong Finix merchant is a security incident, not a sync bug.
 */

export interface ReconciliationFlag {
  type:
    | "MISSING_FINIX_ID"
    | "DUPLICATE_SUBSCRIPTION_REFERENCE"
    | "TRIAL_DATE_MISMATCH"
    | "MERCHANT_ROUTING_MISMATCH"
    | "STALE_PAST_DUE"
    | "UNKNOWN_ORGANIZATION_CHARGE";
  organizationId: string | null;
  subscriptionId: string | null;
  detail: string;
}

export interface ReconciliationResult {
  scannedCount: number;
  updatedCount: number;
  errorCount: number;
  flags: ReconciliationFlag[];
}

const STALE_PAST_DUE_DAYS = 30;
const RECONCILE_TIMEOUT_HOURS = 1; // an INCOMPLETE row older than this with no finixSubscriptionId is an uncertain-state candidate

export async function reconcileWgcSubscriptions(): Promise<ReconciliationResult> {
  const flags: ReconciliationFlag[] = [];
  let updatedCount = 0;
  let errorCount = 0;

  const expectedMerchantId = (() => {
    try {
      return getWgcBillingMerchantId();
    } catch {
      return null; // config not set — every subscription's merchant will be flagged, which is correct
    }
  })();

  const subscriptions = await prisma.wgcSubscription.findMany({
    where: { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } },
  });

  // Cross-org monitoring checks (structural, not per-subscription Finix calls).
  const merchantIdCounts = new Map<string, number>();
  for (const sub of subscriptions) {
    if (sub.finixSubscriptionId) {
      merchantIdCounts.set(sub.finixSubscriptionId, (merchantIdCounts.get(sub.finixSubscriptionId) ?? 0) + 1);
    }
    if (!sub.finixSubscriptionId && sub.status === "INCOMPLETE" && sub.createdAt < new Date(Date.now() - RECONCILE_TIMEOUT_HOURS * 60 * 60 * 1000)) {
      flags.push({
        type: "MISSING_FINIX_ID",
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        detail: `Subscription row has been INCOMPLETE (no finixSubscriptionId) for over ${RECONCILE_TIMEOUT_HOURS}h — likely an uncertain-state timeout from a previous activation attempt.`,
      });
    }
    if (expectedMerchantId && sub.finixBillingMerchantId && sub.finixBillingMerchantId !== expectedMerchantId) {
      flags.push({
        type: "MERCHANT_ROUTING_MISMATCH",
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        detail: `Subscription's stored finixBillingMerchantId (${sub.finixBillingMerchantId}) does not match the currently-configured WGC billing merchant (${expectedMerchantId}). Never auto-repaired.`,
      });
    }
    if (sub.status === "PAST_DUE" && sub.pastDueAt && sub.pastDueAt < new Date(Date.now() - STALE_PAST_DUE_DAYS * 24 * 60 * 60 * 1000)) {
      flags.push({
        type: "STALE_PAST_DUE",
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        detail: `Subscription has been PAST_DUE for over ${STALE_PAST_DUE_DAYS} days with no resolution.`,
      });
    }
  }
  for (const [finixSubscriptionId, count] of merchantIdCounts) {
    if (count > 1) {
      flags.push({
        type: "DUPLICATE_SUBSCRIPTION_REFERENCE",
        organizationId: null,
        subscriptionId: null,
        detail: `finixSubscriptionId ${finixSubscriptionId} is referenced by ${count} WgcSubscription rows — should be impossible given the unique constraint; investigate immediately.`,
      });
    }
  }

  // Per-subscription live reconciliation against Finix (only for rows that
  // actually have a Finix subscription to check).
  for (const sub of subscriptions) {
    if (!sub.finixSubscriptionId) continue;
    try {
      const remote = await finixClient.getSubscription(sub.finixSubscriptionId);
      // Field names confirmed against a real Finix response (see
      // wgcSubscriptionService.ts doc comment): trial state lives in
      // subscription_phase, not state; there is no trial_end field —
      // first_charge_at is the effective trial-end date while
      // subscription_phase is "TRIAL"; next_billing_date is a
      // {year, month, day} object, not an ISO string.
      const remoteState: string | undefined = remote?.state;
      const remoteSubscriptionPhase: string | undefined = remote?.subscription_phase;
      const remoteIsTrialPhase = remoteSubscriptionPhase === "TRIAL";
      const remoteTrialEnd = remoteIsTrialPhase && remote?.first_charge_at ? new Date(remote.first_charge_at) : null;
      const remoteNextBillingDate = remote?.next_billing_date;
      const remoteNextCharge =
        remoteNextBillingDate && typeof remoteNextBillingDate === "object"
          ? new Date(Date.UTC(remoteNextBillingDate.year, remoteNextBillingDate.month - 1, remoteNextBillingDate.day))
          : null;

      const driftedTrialEnd = Boolean(
        remoteTrialEnd && sub.trialEndsAt && Math.abs(remoteTrialEnd.getTime() - sub.trialEndsAt.getTime()) > 24 * 60 * 60 * 1000,
      );
      if (driftedTrialEnd) {
        flags.push({
          type: "TRIAL_DATE_MISMATCH",
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          detail: `Locally-stored trialEndsAt (${sub.trialEndsAt?.toISOString()}) disagrees with Finix's first_charge_at (${remoteTrialEnd?.toISOString()}) by more than 24h.`,
        });
      }

      const mappedStatus = remoteIsTrialPhase ? "TRIALING" : remoteState === "CANCELED" ? "CANCELED" : sub.status === "PAST_DUE" ? "PAST_DUE" : "ACTIVE";
      const needsUpdate =
        mappedStatus !== sub.status ||
        (remoteTrialEnd && sub.trialEndsAt?.getTime() !== remoteTrialEnd.getTime()) ||
        (remoteNextCharge && sub.nextChargeAt?.getTime() !== remoteNextCharge.getTime());

      if (needsUpdate) {
        await prisma.wgcSubscription.update({
          where: { id: sub.id },
          data: {
            status: mappedStatus,
            trialEndsAt: remoteTrialEnd ?? sub.trialEndsAt,
            nextChargeAt: remoteNextCharge ?? sub.nextChargeAt,
            lastSyncedAt: new Date(),
          },
        });
        updatedCount++;
      } else {
        await prisma.wgcSubscription.update({ where: { id: sub.id }, data: { lastSyncedAt: new Date() } });
      }
    } catch (err) {
      errorCount++;
      console.error(`Subscription reconciliation failed for ${sub.id}:`, err);
    }
  }

  const result: ReconciliationResult = { scannedCount: subscriptions.length, updatedCount, errorCount, flags };

  await logBillingAuditEvent({
    action: "reconciliation.completed",
    entityType: "WgcSubscription",
    metadata: { scannedCount: result.scannedCount, updatedCount: result.updatedCount, errorCount: result.errorCount, flagCount: flags.length },
  });
  for (const flag of flags.filter((f) => f.type === "MERCHANT_ROUTING_MISMATCH" || f.type === "DUPLICATE_SUBSCRIPTION_REFERENCE")) {
    await logBillingAuditEvent({
      organizationId: flag.organizationId,
      action: "reconciliation.critical_flag",
      entityType: "WgcSubscription",
      entityId: flag.subscriptionId ?? undefined,
      internalReason: flag.detail,
      metadata: { flagType: flag.type },
    });
  }

  return result;
}
