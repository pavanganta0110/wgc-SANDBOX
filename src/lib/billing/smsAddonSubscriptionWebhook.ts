import { prisma } from "@/lib/prisma";
import { buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Same shape as handleWgcSubscriptionWebhookEvent (see that function's doc
 * comment for why matching happens by finixSubscriptionId, never by a
 * trusted-looking field in the event payload) — a separate function
 * because SmsAddonSubscription is a separate table from WgcSubscription,
 * not a second row on it. Handles the SMS add-on's own recurring
 * $15/$25-a-month charge lifecycle; the monthly overage on top of that
 * allowance is a different, admin-triggered charge (see
 * smsAddonOverageCharge.ts) and never touches this function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Finix webhook payload, matches finix/client.ts convention
export async function handleSmsAddonSubscriptionWebhookEvent(eventType: string, data: any): Promise<boolean> {
  const finixSubscriptionId: string | undefined = data?.tags?.subscription_id || data?.subscription || data?.subscription_id;
  if (!finixSubscriptionId) return false;

  const subscription = await prisma.smsAddonSubscription.findUnique({ where: { finixSubscriptionId } });
  if (!subscription) return false;

  const isTransferEvent = data?.amount != null || data?.state != null;
  if (!isTransferEvent) return true;

  const finixTransferId: string | undefined = data?.id;
  const amountCents: number = data?.amount ?? subscription.monthlyAmountCents;
  const state: string = (data?.state || "").toUpperCase();
  const succeeded = state === "SUCCEEDED";
  const failed = state === "FAILED";
  if (!succeeded && !failed) return true;

  const billingPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  const idempotencyKey = buildIdempotencyKey(subscription.organizationId, "SMS_ADDON_SUBSCRIPTION", finixTransferId || billingPeriod);

  const existingCharge = await prisma.billingCharge.findUnique({ where: { idempotencyKey } });
  if (existingCharge) return true; // already processed — duplicate/out-of-order webhook

  await prisma.billingCharge.create({
    data: {
      organizationId: subscription.organizationId,
      chargeType: "SMS_ADDON_SUBSCRIPTION",
      billingPeriod,
      amountCents,
      currency: subscription.currency,
      finixTransferId: finixTransferId ?? null,
      finixSubscriptionId,
      idempotencyKey,
      status: succeeded ? "SUCCEEDED" : "FAILED",
      succeededAt: succeeded ? new Date() : null,
      failedAt: failed ? new Date() : null,
    },
  });

  if (succeeded) {
    await prisma.smsAddonSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", lastChargeAt: new Date(), pastDueAt: null, gracePeriodEndsAt: null },
    });
    await logBillingAuditEvent({
      organizationId: subscription.organizationId,
      action: "sms_addon_subscription.charge_succeeded",
      entityType: "SmsAddonSubscription",
      entityId: subscription.id,
      metadata: { finixTransferId, amountCents },
    });
  } else {
    const gracePeriodDays = Number(process.env.WGC_BILLING_GRACE_PERIOD_DAYS || 14);
    const gracePeriodEndsAt = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);

    await prisma.smsAddonSubscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE", pastDueAt: new Date(), gracePeriodEndsAt },
    });
    await logBillingAuditEvent({
      organizationId: subscription.organizationId,
      action: "sms_addon_subscription.past_due",
      entityType: "SmsAddonSubscription",
      entityId: subscription.id,
      metadata: { finixTransferId, amountCents, gracePeriodEndsAt },
    });
  }

  return true;
}
