import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { sendCancellationConfirmationEmail } from "@/lib/billing/billingEmails";

export class WgcSubscriptionCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WgcSubscriptionCancellationError";
  }
}

/**
 * Cancels an organization's WGC platform subscription. Never reports
 * success unless Finix itself confirms the cancellation — a thrown error
 * here means the WgcSubscription row is left exactly as it was (no
 * canceledAt written), so a caller can safely retry rather than the UI
 * showing "canceled" when it isn't.
 *
 * Permission enforcement (owner or canManageSubscription) happens at the
 * API route layer, not here — this function only re-confirms the
 * subscription actually belongs to the organizationId passed in.
 */
export async function cancelWgcSubscription(params: {
  organizationId: string;
  actorUserId: string;
  actorEmail: string;
}): Promise<{ canceledAt: Date }> {
  const subscription = await prisma.wgcSubscription.findUnique({ where: { organizationId: params.organizationId } });
  if (!subscription) {
    throw new WgcSubscriptionCancellationError("No subscription found for this organization.");
  }
  if (subscription.organizationId !== params.organizationId) {
    throw new WgcSubscriptionCancellationError("This subscription does not belong to your organization.");
  }
  if (subscription.status === "CANCELED") {
    throw new WgcSubscriptionCancellationError("This subscription is already canceled.");
  }
  if (!subscription.finixSubscriptionId) {
    throw new WgcSubscriptionCancellationError("This subscription was never successfully created with Finix — nothing to cancel.");
  }

  try {
    await finixClient.cancelSubscription(subscription.finixSubscriptionId);
  } catch (err) {
    await logBillingAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      action: "subscription.cancel_failed",
      entityType: "WgcSubscription",
      entityId: subscription.id,
      internalReason: err instanceof Error ? err.message : String(err),
    });
    throw new WgcSubscriptionCancellationError(
      `Finix did not confirm the cancellation — subscription was NOT canceled. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const canceledAt = new Date();
  await prisma.wgcSubscription.update({
    where: { id: subscription.id },
    data: { status: "CANCELED", canceledAt, cancelRequestedAt: canceledAt, canceledByUserId: params.actorUserId },
  });

  await logBillingAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    action: "subscription.canceled",
    entityType: "WgcSubscription",
    entityId: subscription.id,
    previousValue: { status: subscription.status },
    newValue: { status: "CANCELED", canceledAt },
  });

  const church = await prisma.church.findUnique({ where: { id: params.organizationId }, select: { name: true } });
  await sendCancellationConfirmationEmail({
    organizationId: params.organizationId,
    organizationName: church?.name || "your organization",
    recipientEmail: params.actorEmail,
    subscriptionId: subscription.id,
    effectiveAt: canceledAt,
  }).catch(() => {});

  return { canceledAt };
}
