/**
 * Automatic recovery on a failed recurring charge.
 *
 * Deliberately scoped to communication only — never a re-charge attempt.
 * Finix's subscriptions API (see finix/client.ts) exposes only
 * create/get/cancel, and nothing in this codebase (or Finix's docs, as far
 * as we've confirmed) says whether a BILL_AUTOMATICALLY subscription is
 * already retried internally on a failed cycle. Building a WGC-side
 * re-charge on top of an unconfirmed Finix retry risks double-charging a
 * donor, so this stays limited to: track the failure on the subscription,
 * and get the donor a secure payment-update link — the actual "retry
 * strategy" step waits on that Finix confirmation.
 */
import { prisma } from "@/lib/prisma";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { sendSubscriptionPaymentUpdateLink } from "@/lib/subscriptions/paymentUpdateLink";
import { emitEvent } from "@/lib/events/emitEvent";

/** A second recovery email within this window for the same subscription is
 * skipped — Finix can report the same underlying failure more than once
 * (e.g. a resync webhook alongside the original), and a donor shouldn't get
 * duplicate "update your card" emails for one failure. */
const RECOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface FailedRecurringPayment {
  finixSubscriptionId: string | null;
  status: string;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export async function triggerRecoveryOnPaymentFailure(payment: FailedRecurringPayment): Promise<void> {
  if (payment.status !== "FAILED" || !payment.finixSubscriptionId) return;

  const subscription = await prisma.finixSubscription.findUnique({ where: { finixSubscriptionId: payment.finixSubscriptionId } });
  if (!subscription) return;

  await prisma.finixSubscription.update({
    where: { id: subscription.id },
    data: {
      failureCode: payment.failureCode ?? null,
      failureMessage: payment.failureMessage ?? null,
      retryCount: (subscription.retryCount ?? 0) + 1,
    },
  });

  const recordAttempt = (action: string, setupLinkId?: string) =>
    prisma.subscriptionRecoveryAttempt.create({
      data: { churchId: subscription.churchId ?? "", finixSubscriptionId: subscription.finixSubscriptionId, donorId: subscription.donorId, trigger: "PAYMENT_FAILED", action, setupLinkId: setupLinkId ?? null },
    });

  if (!subscription.churchId) return;

  const displayStatus = resolveSubscriptionDisplayStatus({ rawState: subscription.state, canceledAt: subscription.canceledAt, completedAt: subscription.completedAt });
  if (displayStatus !== "ACTIVE" && displayStatus !== "PAST_DUE") {
    await recordAttempt("SKIPPED_NOT_ACTIVE_OR_PAST_DUE");
    return;
  }

  if (!subscription.donorId) {
    await recordAttempt("SKIPPED_NO_DONOR_EMAIL");
    return;
  }
  const donor = await prisma.donor.findFirst({ where: { id: subscription.donorId, churchId: subscription.churchId } });
  if (!donor?.email) {
    await recordAttempt("SKIPPED_NO_DONOR_EMAIL");
    return;
  }

  const recentAttempt = await prisma.subscriptionRecoveryAttempt.findFirst({
    where: { finixSubscriptionId: subscription.finixSubscriptionId, action: "UPDATE_LINK_SENT", createdAt: { gte: new Date(Date.now() - RECOVERY_COOLDOWN_MS) } },
  });
  if (recentAttempt) {
    await recordAttempt("SKIPPED_RECENTLY_SENT");
    return;
  }

  const church = await prisma.church.findUnique({ where: { id: subscription.churchId } });
  if (!church) return;

  const result = await sendSubscriptionPaymentUpdateLink({
    churchId: subscription.churchId,
    churchName: church.name,
    subscription,
    donor: { id: donor.id, email: donor.email },
    createdByUserId: null,
  });

  await recordAttempt(result.success ? "UPDATE_LINK_SENT" : "UPDATE_LINK_SEND_FAILED", result.linkId);

  if (result.success) {
    try {
      await emitEvent({ type: "recurring.retry_scheduled", churchId: subscription.churchId, data: { finixSubscriptionId: subscription.finixSubscriptionId, donorId: donor.id } });
    } catch (err) {
      console.error("Failed to emit recurring.retry_scheduled event:", err);
    }
  }
}
