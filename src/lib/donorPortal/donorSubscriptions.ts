import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { calculateWgcFeeAmounts } from "@/lib/giving/feeCalculator";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { emitEvent } from "@/lib/events/emitEvent";
import { findPortalDonorsByEmail } from "@/lib/donorPortal/donorAuth";

const MIN_AMOUNT_CENTS = 100;

/** Finix stores instrument types as PAYMENT_CARD / BANK_ACCOUNT — match loosely so a bank account is never mistaken for a card. */
export function isBankInstrumentType(paymentMethodType: string | null | undefined): boolean {
  return /bank/i.test(paymentMethodType ?? "");
}

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
async function beginAction(ctx: DonorActionContext, actionType: "UPDATE_AMOUNT" | "CANCEL" | "PAYMENT_METHOD_UPDATED", finixSubscriptionId: string, oldValue: Prisma.InputJsonValue, newValue?: Prisma.InputJsonValue) {
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
    paymentMethod: isBankInstrumentType(instrument?.paymentMethodType) ? "ACH" : "CARD",
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

/** What the card-update page needs to render — only for a subscription this donor owns and whose card can be changed online. */
export async function loadDonorCardUpdateContext(ctx: Pick<DonorActionContext, "churchId" | "sessionDonorId" | "subscriptionId">) {
  const { subscription, status } = await loadOwnedSubscription(ctx.churchId, ctx.sessionDonorId, ctx.subscriptionId);
  assertCardUpdatable(subscription, status);
  const instrument = subscription.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findFirst({ where: { finixPaymentInstrumentId: subscription.finixPaymentInstrumentId, churchId: ctx.churchId }, select: { paymentMethodType: true, cardBrand: true, cardLast4: true } })
    : null;
  if (isBankInstrumentType(instrument?.paymentMethodType)) throw new DonorSubscriptionError("This gift is paid from a bank account. Please contact the organization to change it.", 400);
  return {
    amountCents: subscription.amountCents,
    billingInterval: subscription.billingInterval,
    donorName: (await prisma.donor.findFirst({ where: { id: ctx.sessionDonorId, churchId: ctx.churchId }, select: { name: true } }))?.name ?? null,
    currentCard: instrument ? { brand: instrument.cardBrand, last4: instrument.cardLast4 } : null,
  };
}

function assertCardUpdatable(subscription: { finixBuyerIdentityId: string | null; donorCoversFee: boolean | null; donationAmountCents: number | null }, status: string) {
  if (status !== "ACTIVE" && status !== "PAST_DUE") throw new DonorSubscriptionError("Only an active recurring gift's card can be updated.", 400);
  if (!subscription.finixBuyerIdentityId) throw new DonorSubscriptionError("This recurring gift can't be changed online. Please contact the organization.", 400);
  // A covered fee depends on the card brand, so the donation amount must be known to recompute it.
  if (subscription.donorCoversFee && subscription.donationAmountCents == null) throw new DonorSubscriptionError("This recurring gift can't be changed online. Please contact the organization.", 400);
}

/**
 * Swaps the card on an existing subscription IN PLACE: the card is tokenized in
 * the browser by Finix.js (raw numbers never reach us), saved on the donor's
 * existing Finix identity, then PUT onto the same subscription. No new
 * subscription, no cancel, no new donor record, and the billing schedule is
 * untouched. When the donor covers fees and the new card's brand has a
 * different fee, the amount is recomputed in the same PUT.
 */
export async function donorUpdateSubscriptionCard(ctx: DonorActionContext, finixToken: string) {
  if (typeof finixToken !== "string" || finixToken.length < 5 || finixToken.length > 200) throw new DonorSubscriptionError("Please re-enter your card details.", 400);

  const { subscription, status } = await loadOwnedSubscription(ctx.churchId, ctx.sessionDonorId, ctx.subscriptionId);
  assertCardUpdatable(subscription, status);
  const identityId = subscription.finixBuyerIdentityId!;
  const currentInstrument = subscription.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findFirst({ where: { finixPaymentInstrumentId: subscription.finixPaymentInstrumentId, churchId: ctx.churchId }, select: { paymentMethodType: true } })
    : null;
  if (isBankInstrumentType(currentInstrument?.paymentMethodType)) throw new DonorSubscriptionError("This gift is paid from a bank account. Please contact the organization to change it.", 400);

  const begun = await beginAction(ctx, "PAYMENT_METHOD_UPDATED", subscription.finixSubscriptionId, { finixPaymentInstrumentId: subscription.finixPaymentInstrumentId, amountCents: subscription.amountCents });
  if (begun.replay) return begun.replay;

  const fail = async (message: string, httpStatus: number, reason: string): Promise<never> => {
    await prisma.subscriptionAction.update({ where: { idempotencyKey: ctx.idempotencyKey }, data: { state: "FAILED", failureReason: reason } });
    throw new DonorSubscriptionError(message, httpStatus);
  };

  // 1. Save the new card on the donor's identity. Harmless if a later step fails — it is simply never attached.
  let instrument: { id?: string; type?: string; brand?: string; last_four?: string } | null = null;
  try {
    instrument = await finixClient.createPaymentInstrument({ identity: identityId, token: finixToken, type: "TOKEN" });
  } catch (err) {
    return fail("We couldn't save that card. Please check the details and try again.", 502, err instanceof Error ? err.message : "createPaymentInstrument failed");
  }
  if (!instrument?.id) return fail("We couldn't save that card. Please check the details and try again.", 502, "No instrument id returned");
  if (instrument.type && instrument.type !== "PAYMENT_CARD") return fail("Please enter a credit or debit card.", 400, `Unsupported instrument type ${instrument.type}`);

  // 2. A covered fee follows the card brand — recompute so the donor is charged exactly donation + fee.
  const donorCoversFee = subscription.donorCoversFee ?? false;
  let newAmountCents = subscription.amountCents;
  if (donorCoversFee) {
    const fee = calculateWgcFeeAmounts({ donationAmountCents: subscription.donationAmountCents!, donorCoversFee: true, paymentMethod: "CARD", cardBrand: instrument.brand ?? null });
    newAmountCents = fee.amountToChargeCents;
  }
  const amountChanged = newAmountCents != null && newAmountCents !== subscription.amountCents;

  // 3. Swap on Finix first (external HTTP, outside any transaction); the DB follows only after Finix confirms.
  try {
    await finixClient.updateSubscription(subscription.finixSubscriptionId, { buyer_details: { instrument_id: instrument.id }, ...(amountChanged ? { amount: newAmountCents! } : {}) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "updateSubscription failed";
    // Finix authorizes a new card before attaching it, so a declined card is a donor-fixable problem, not an outage.
    if (/declined/i.test(reason)) return fail("That card was declined. Please try a different card — your current card is unchanged.", 400, reason);
    return fail("We couldn't update your card. Your current card is unchanged.", 502, reason);
  }

  try {
    await syncPaymentInstrument(instrument.id, { churchId: ctx.churchId, donorId: subscription.donorId ?? undefined });
  } catch (err) {
    console.error("Failed to snapshot the new payment instrument:", err);
  }

  const result = { id: subscription.id, last4: instrument.last_four ?? null, brand: instrument.brand ?? null, amountCents: newAmountCents };
  await prisma.$transaction([
    prisma.finixSubscription.update({
      where: { id: subscription.id },
      data: { finixPaymentInstrumentId: instrument.id, ...(amountChanged ? { amountCents: newAmountCents! } : {}), lastSyncedAt: new Date() },
    }),
    prisma.subscriptionAction.update({
      where: { idempotencyKey: ctx.idempotencyKey },
      data: { state: "COMPLETED", newValue: { ...result, finixPaymentInstrumentId: instrument.id, source: "DONOR_PORTAL", ipAddress: ctx.ipAddress ?? null, userAgent: ctx.userAgent ?? null }, completedAt: new Date() },
    }),
  ]);

  return result;
}
