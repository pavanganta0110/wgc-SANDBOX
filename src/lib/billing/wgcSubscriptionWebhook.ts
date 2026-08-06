import { prisma } from "@/lib/prisma";
import { buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { sendPaymentReceiptEmail, sendFailedPaymentEmail } from "@/lib/billing/billingEmails";

/**
 * Resolves any incoming Finix webhook event to a WGC platform subscription
 * by finixSubscriptionId (never by trusting an organization ID from the
 * event payload, and never by guessing a specific eventType string — this
 * matches by the ID our own createSubscription call stored, which is the
 * one thing we can trust regardless of exactly which event names Finix
 * sends for a given transfer/subscription state change). Returns null for
 * every event unrelated to WGC's own billing (the overwhelming majority —
 * donation/invoice transfers on a client organization's own merchant never
 * match any WgcSubscription row), so this never interferes with the
 * existing per-eventType onboarding/sync logic.
 *
 * NOTE: the exact Finix event/field names used to detect a subscription
 * charge attempt and its success/failure state are this implementation's
 * best-effort guess (subscription id on the event payload, a
 * SUCCEEDED/FAILED-style state) and MUST be confirmed against WGC's real
 * Finix webhook event catalog before production use (spec section 31).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Finix webhook payload, matches finix/client.ts convention
export async function handleWgcSubscriptionWebhookEvent(eventType: string, data: any): Promise<boolean> {
  const finixSubscriptionId: string | undefined = data?.subscription || data?.subscription_id;
  if (!finixSubscriptionId) return false;

  const subscription = await prisma.wgcSubscription.findUnique({ where: { finixSubscriptionId } });
  if (!subscription) return false;

  // Only Transfer-shaped events (a charge attempt) matter here — a
  // subscription's own state-change events (e.g. "subscription.updated")
  // are informational and reconciled separately (see reconciliation cron);
  // this branch specifically handles "did this billing cycle's charge
  // succeed or fail."
  const isTransferEvent = data?.amount != null || data?.state != null;
  if (!isTransferEvent) return true; // recognized as ours, nothing further to do yet

  const finixTransferId: string | undefined = data?.id;
  const amountCents: number = data?.amount ?? subscription.amountCents;
  const state: string = (data?.state || "").toUpperCase();
  const succeeded = state === "SUCCEEDED";
  const failed = state === "FAILED";
  if (!succeeded && !failed) return true;

  const billingPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  const idempotencyKey = buildIdempotencyKey(subscription.organizationId, "WGC_PLATFORM_SUBSCRIPTION", finixTransferId || billingPeriod);

  const existingCharge = await prisma.billingCharge.findUnique({ where: { idempotencyKey } });
  if (existingCharge) return true; // already processed — duplicate/out-of-order webhook

  const church = await prisma.church.findUnique({ where: { id: subscription.organizationId }, select: { name: true, primaryContactEmail: true } });
  const billingAccount = await prisma.wgcBillingAccount.findUnique({ where: { organizationId: subscription.organizationId } });

  await prisma.billingCharge.create({
    data: {
      organizationId: subscription.organizationId,
      chargeType: "WGC_PLATFORM_SUBSCRIPTION",
      billingPeriod,
      amountCents,
      currency: subscription.currency,
      finixTransferId: finixTransferId ?? null,
      finixSubscriptionId,
      pricingVersionId: subscription.priceVersionId,
      idempotencyKey,
      status: succeeded ? "SUCCEEDED" : "FAILED",
      succeededAt: succeeded ? new Date() : null,
      failedAt: failed ? new Date() : null,
    },
  });

  if (succeeded) {
    await prisma.wgcSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", lastChargeAt: new Date(), pastDueAt: null, gracePeriodEndsAt: null, lastSyncedAt: new Date() },
    });
    await prisma.promotionEntitlement.updateMany({
      where: { organizationId: subscription.organizationId, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await logBillingAuditEvent({
      organizationId: subscription.organizationId,
      action: "charge.succeeded",
      entityType: "BillingCharge",
      metadata: { finixTransferId, amountCents },
    });
    if (church?.primaryContactEmail) {
      await sendPaymentReceiptEmail({
        organizationId: subscription.organizationId,
        organizationName: church.name,
        recipientEmail: church.primaryContactEmail,
        chargeId: finixTransferId || idempotencyKey,
        amountCents,
        chargedAt: new Date(),
        maskedBillingMethod: billingAccount?.maskedBillingDetails || "On file",
      });
    }
  } else {
    // Configurable grace period — see WGC_BILLING_GRACE_PERIOD_DAYS.
    // Default 14 days; a real admin-configurable value belongs in the
    // billing-config admin UI (not yet built) — see completion report.
    const gracePeriodDays = Number(process.env.WGC_BILLING_GRACE_PERIOD_DAYS || 14);
    const gracePeriodEndsAt = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);

    await prisma.wgcSubscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE", pastDueAt: new Date(), gracePeriodEndsAt, lastSyncedAt: new Date() },
    });
    await logBillingAuditEvent({
      organizationId: subscription.organizationId,
      action: "subscription.past_due",
      entityType: "BillingCharge",
      metadata: { finixTransferId, amountCents, gracePeriodEndsAt },
    });
    if (church?.primaryContactEmail) {
      await sendFailedPaymentEmail({
        organizationId: subscription.organizationId,
        organizationName: church.name,
        recipientEmail: church.primaryContactEmail,
        chargeId: finixTransferId || idempotencyKey,
        amountCents,
        failedAt: new Date(),
        gracePeriodEndsAt,
        updatePaymentMethodUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com"}/merchant/subscription`,
      });
    }
  }

  return true;
}
