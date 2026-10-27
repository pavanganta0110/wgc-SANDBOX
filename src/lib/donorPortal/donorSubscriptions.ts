import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { calculateWgcFeeAmounts } from "@/lib/giving/feeCalculator";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { generateSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { emitEvent } from "@/lib/events/emitEvent";
import { findPortalDonorsByEmail } from "@/lib/donorPortal/donorAuth";

const MIN_AMOUNT_CENTS = 100;
const SETUP_LINK_EXPIRY_MS = 60 * 60 * 1000;

export class DonorSubscriptionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface DonorActionContext {
  churchId: string;
  /** The signed-in donor; every other donor id is re-derived from their email inside this church. */
  sessionDonorId: string;
  subscriptionId: string;
  idempotencyKey: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Loads a subscription only if it belongs to this church AND to a donor record
 * sharing the signed-in donor's email. A subscription id from another church or
 * another person returns "not found", never "forbidden", so ids can't be probed.
 */
async function loadOwnedSubscription(churchId: string, sessionDonorId: string, subscriptionId: string) {
  const sessionDonor = await prisma.donor.findFirst({ where: { id: sessionDonorId, churchId }, select: { email: true } });
  if (!sessionDonor?.email) throw new DonorSubscriptionError("Recurring gift not found.", 404);

  const donorIds = (await findPortalDonorsByEmail(churchId, sessionDonor.email)).map((d) => d.id);
  const subscription = await prisma.finixSubscription.findFirst({ where: { id: subscriptionId, churchId, donorId: { in: donorIds } } });
  if (!subscription) throw new DonorSubscriptionError("Recurring gift not found.", 404);

  const status = resolveSubscriptionDisplayStatus({ rawState: subscription.state, canceledAt: subscription.canceledAt, completedAt: subscription.completedAt });
  return { subscription, status };
}

/** Claims the idempotency key; returns the stored result when this exact request already completed. */
async function beginAction(ctx: DonorActionContext, actionType: "UPDATE_AMOUNT" | "CANCEL", finixSubscriptionId: string, oldValue: Prisma.InputJsonValue, newValue?: Prisma.InputJsonValue) {
  try {
    await prisma.subscriptionAction.create({
      data: { churchId: ctx.churchId, finixSubscriptionId, actionType, idempotencyKey: ctx.idempotencyKey, requestedByUserId: null, oldValue, newValue, state: "PENDING" },
    });
    return { replay: null as Prisma.JsonValue | null };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.subscriptionAction.findUnique({ where: { idempotencyKey: ctx.idempotencyKey } });
      const sameRequest = existing?.churchId === ctx.churchId && existing.finixSubscriptionId === finixSubscriptionId && existing.actionType === actionType;
      if (sameRequest && existing.state === "COMPLETED") return { replay: existing.newValue ?? {} };
      if (sameRequest && existing.state === "FAILED") {
        // The earlier attempt never changed anything, so the donor may retry with the same key.
        // updateMany + count lets exactly one of two concurrent retries win the claim.
        const claimed = await prisma.subscriptionAction.updateMany({
          where: { idempotencyKey: ctx.idempotencyKey, state: "FAILED" },
          data: { state: "PENDING", failureReason: null, oldValue, newValue: newValue ?? Prisma.JsonNull },
        });
        if (claimed.count === 1) return { replay: null as Prisma.JsonValue | null };
      }
      throw new DonorSubscriptionError("This request is already being processed.", 409);
    }
    throw err;
  }
}

/**
 * Changes the recurring amount IN PLACE via Finix's PUT /subscriptions (verified
 * against the sandbox: amount changes, next billing date is untouched). Because
 * the Finix subscription id never changes there is no cancel/recreate gap in
 * which a donor's gift could silently stop.
 */
export async function donorUpdateSubscriptionAmount(ctx: DonorActionContext, newDonationAmountCents: number) {
  if (!Number.isInteger(newDonationAmountCents) || newDonationAmountCents < MIN_AMOUNT_CENTS) {
    throw new DonorSubscriptionError("Please enter an amount of at least $1.00.", 400);
  }

  const { subscription, status } = await loadOwnedSubscription(ctx.churchId, ctx.sessionDonorId, ctx.subscriptionId);
  if (status !== "ACTIVE") throw new DonorSubscriptionError("Only an active recurring gift can be changed.", 400);
  if (subscription.isPledge) throw new DonorSubscriptionError("This recurring gift is part of a pledge. Please contact the organization to change it.", 400);

  const donorCoversFee = subscription.donorCoversFee ?? false;
  const currentDonationCents = subscription.donationAmountCents ?? (donorCoversFee ? null : subscription.amountCents);
  if (currentDonationCents == null || !subscription.finixPaymentInstrumentId) {
    throw new DonorSubscriptionError("This recurring gift can't be changed online. Please contact the organization.", 400);
  }
  if (newDonationAmountCents === currentDonationCents) throw new DonorSubscriptionError("That is already your current amount.", 400);

  const instrument = await prisma.finixPaymentInstrumentSnapshot.findFirst({
    where: { finixPaymentInstrumentId: subscription.finixPaymentInstrumentId, churchId: ctx.churchId },
    select: { paymentMethodType: true, cardBrand: true },
  });
  const fee = calculateWgcFeeAmounts({
    donationAmountCents: newDonationAmountCents,
    donorCoversFee,
    paymentMethod: instrument?.paymentMethodType === "bank" ? "ACH" : "CARD",
    cardBrand: instrument?.cardBrand || null,
  });
  const finalAmountCents = donorCoversFee ? fee.amountToChargeCents : newDonationAmountCents;

  const begun = await beginAction(
    ctx,
    "UPDATE_AMOUNT",
    subscription.finixSubscriptionId,
    { amountCents: subscription.amountCents, donationAmountCents: currentDonationCents },
    { amountCents: finalAmountCents, donationAmountCents: newDonationAmountCents, source: "DONOR_PORTAL", ipAddress: ctx.ipAddress ?? null, userAgent: ctx.userAgent ?? null },
  );
  if (begun.replay) return begun.replay;

  // External HTTP first, outside any DB transaction; the DB is only touched after Finix confirms.
  try {
    await finixClient.updateSubscription(subscription.finixSubscriptionId, { amount: finalAmountCents });
  } catch (err) {
    await prisma.subscriptionAction.update({
      where: { idempotencyKey: ctx.idempotencyKey },
      data: { state: "FAILED", failureReason: err instanceof Error ? err.message : "Failed to update amount" },
    });
    throw new DonorSubscriptionError("We couldn't update your gift. Your current amount is unchanged.", 502);
  }

  const result = { id: subscription.id, amountCents: finalAmountCents, donationAmountCents: newDonationAmountCents };
  await prisma.$transaction([
    prisma.finixSubscription.update({
      where: { id: subscription.id },
      data: { amountCents: finalAmountCents, donationAmountCents: newDonationAmountCents, feeCalculationVersion: "v1", lastSyncedAt: new Date() },
    }),
    prisma.subscriptionAction.update({
      where: { idempotencyKey: ctx.idempotencyKey },
      data: { state: "COMPLETED", newValue: { ...result, source: "DONOR_PORTAL", ipAddress: ctx.ipAddress ?? null, userAgent: ctx.userAgent ?? null }, completedAt: new Date() },
    }),
  ]);

  return result;
}

/** Donor-initiated cancel. Same guarded DELETE the merchant dashboard uses; refuses pledge installments and already-ended gifts. */
export async function donorCancelSubscription(ctx: DonorActionContext, reason?: string | null) {
  const { subscription, status } = await loadOwnedSubscription(ctx.churchId, ctx.sessionDonorId, ctx.subscriptionId);
  if (status === "CANCELED") throw new DonorSubscriptionError("This recurring gift is already canceled.", 400);
  if (status === "COMPLETED") throw new DonorSubscriptionError("This recurring gift has already completed.", 400);
  if (subscription.isPledge) throw new DonorSubscriptionError("This recurring gift is part of a pledge. Please contact the organization to cancel it.", 400);

  const begun = await beginAction(ctx, "CANCEL", subscription.finixSubscriptionId, { state: subscription.state });
  if (begun.replay) return begun.replay;

  try {
    await finixClient.cancelSubscription(subscription.finixSubscriptionId);
  } catch (err) {
    await prisma.subscriptionAction.update({
      where: { idempotencyKey: ctx.idempotencyKey },
      data: { state: "FAILED", failureReason: err instanceof Error ? err.message : "Failed to cancel subscription" },
    });
    throw new DonorSubscriptionError("Your recurring gift was not canceled. Please try again.", 502);
  }

  const canceledAt = new Date();
  await prisma.$transaction([
    prisma.finixSubscription.update({
      where: { id: subscription.id },
      data: { canceledAt, cancelReason: reason?.slice(0, 500) || "Canceled by donor in the donor portal", canceledByUserId: null, state: "CANCELED", lastSyncedAt: canceledAt },
    }),
    prisma.subscriptionAction.update({
      where: { idempotencyKey: ctx.idempotencyKey },
      data: { state: "COMPLETED", newValue: { canceledAt: canceledAt.toISOString(), source: "DONOR_PORTAL", ipAddress: ctx.ipAddress ?? null, userAgent: ctx.userAgent ?? null }, completedAt: canceledAt },
    }),
  ]);

  try {
    const eventType = status === "PAST_DUE" ? "recurring.cancelled_after_failure" : "recurring.cancelled";
    await emitEvent({ type: eventType, churchId: ctx.churchId, data: { finixSubscriptionId: subscription.finixSubscriptionId, donorId: subscription.donorId, reason: reason ?? null, source: "DONOR_PORTAL" } });
  } catch (err) {
    console.error("Failed to emit recurring cancellation event:", err);
  }

  return { id: subscription.id, canceledAt: canceledAt.toISOString() };
}

/**
 * Returns the URL of the existing hosted card-update page (/setup/[token]) for
 * this subscription. The signed-in donor skips the email round trip, but the
 * card itself is still entered into Finix.js on that page — card numbers never
 * reach our servers.
 */
export async function createDonorPaymentUpdateSetupUrl(ctx: Pick<DonorActionContext, "churchId" | "sessionDonorId" | "subscriptionId">): Promise<string> {
  const { subscription, status } = await loadOwnedSubscription(ctx.churchId, ctx.sessionDonorId, ctx.subscriptionId);
  if (status !== "ACTIVE" && status !== "PAST_DUE") throw new DonorSubscriptionError("Only an active recurring gift's card can be updated.", 400);

  const donor = await prisma.donor.findFirst({ where: { id: subscription.donorId!, churchId: ctx.churchId }, select: { id: true, email: true } });
  if (!donor?.email) throw new DonorSubscriptionError("Recurring gift not found.", 404);

  const { token, tokenHash } = generateSetupLinkToken();
  await prisma.subscriptionSetupLink.create({
    data: {
      churchId: ctx.churchId,
      donorId: donor.id,
      donorEmail: donor.email,
      tokenHash,
      amountCents: subscription.amountCents ?? 0,
      billingInterval: subscription.billingInterval ?? "MONTHLY",
      startDate: new Date(),
      fundId: subscription.fundId,
      status: "SENT",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + SETUP_LINK_EXPIRY_MS),
      createdByUserId: null,
      updateTargetFinixSubscriptionId: subscription.finixSubscriptionId,
    },
  });

  return `/setup/${token}`;
}
