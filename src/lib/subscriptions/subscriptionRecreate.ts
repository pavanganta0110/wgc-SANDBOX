import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { formatPersonName } from "@/lib/formatPersonName";
import { calculateWgcFeeAmounts } from "@/lib/giving/feeCalculator";

const TERMS_VERSION = "2026-01-recurring-admin-update-v1";

/**
 * Finix's subscriptions API has no in-place update endpoint — confirmed in
 * src/lib/finix/client.ts, which only exposes create/get/cancel. "Update
 * Amount" and "Update Frequency" are therefore implemented as cancel the
 * old schedule + create a new one with the changed term, chained via
 * supersedesSubscriptionId/supersededBySubscriptionId so the UI can show
 * "replaced by"/"replaces" instead of two unrelated rows, and a fresh
 * SubscriptionConsent is recorded for the new terms (the old consent record
 * for the canceled subscription is never mutated or deleted).
 */
export async function recreateSubscriptionWithChange(params: {
  churchId: string;
  actorUserId: string;
  oldSubscription: { id: string; finixSubscriptionId: string; donorId: string | null; finixPaymentInstrumentId: string | null; givingLinkId: string | null; fundId: string | null; amountCents: number | null; billingInterval: string | null };
  newAmountCents?: number;
  newBillingInterval?: string;
}) {
  const { churchId, actorUserId, oldSubscription, newAmountCents, newBillingInterval } = params;

  if (!oldSubscription.donorId || !oldSubscription.finixPaymentInstrumentId) {
    throw new Error("This subscription is missing donor or payment method information");
  }

  const [donor, instrument, church, oldSubRecord] = await Promise.all([
    prisma.donor.findFirst({ where: { id: oldSubscription.donorId, churchId } }),
    prisma.finixPaymentInstrumentSnapshot.findFirst({ where: { finixPaymentInstrumentId: oldSubscription.finixPaymentInstrumentId, churchId } }),
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.finixSubscription.findUnique({ where: { id: oldSubscription.id } }),
  ]);
  if (!donor) throw new Error("Donor not found");
  if (!instrument?.finixIdentityId) throw new Error("Payment method not found");
  if (!church?.finixMerchantId) throw new Error("Organization is not fully onboarded");

  const donorCoversFee = oldSubRecord?.donorCoversFee ?? false;
  const baseAmountCents = newAmountCents ?? oldSubRecord?.donationAmountCents ?? oldSubscription.amountCents ?? 0;
  const billingInterval = newBillingInterval ?? oldSubscription.billingInterval ?? "MONTHLY";

  const feeRes = calculateWgcFeeAmounts({
    donationAmountCents: baseAmountCents,
    paymentMethod: instrument.paymentMethodType === "bank" ? "ACH" : "CARD",
    cardBrand: instrument.cardBrand || null,
    donorCoversFee,
  });
  const finalAmountCents = donorCoversFee ? feeRes.amountToChargeCents : baseAmountCents;

  // Cancel the old Finix subscription first — if this fails, nothing else
  // happens and the caller sees a clean failure with the original schedule
  // still intact.
  await finixClient.cancelSubscription(oldSubscription.finixSubscriptionId);

  const finixSubscription = await finixClient.createSubscription({
    amount: finalAmountCents,
    currency: "USD",
    billing_interval: billingInterval as any,
    linked_to: church.finixMerchantId,
    linked_type: "MERCHANT",
    buyer_details: { identity_id: instrument.finixIdentityId, instrument_id: instrument.finixPaymentInstrumentId },
    tags: { source: "wgc_admin_updated", churchId, donorId: oldSubscription.donorId },
  });
  if (!finixSubscription?.id) throw new Error("Failed to create replacement subscription");

  const [canceledOld, newRecord] = await prisma.$transaction([
    prisma.finixSubscription.update({
      where: { id: oldSubscription.id },
      data: { canceledAt: new Date(), cancelReason: "Replaced by amount/frequency update", canceledByUserId: actorUserId, state: "CANCELED", supersededBySubscriptionId: finixSubscription.id, lastSyncedAt: new Date() },
    }),
    prisma.finixSubscription.create({
      data: {
        finixSubscriptionId: finixSubscription.id,
        churchId,
        donorId: oldSubscription.donorId,
        fundId: oldSubscription.fundId,
        givingLinkId: oldSubscription.givingLinkId,
        finixMerchantId: church.finixMerchantId,
        finixBuyerIdentityId: instrument.finixIdentityId,
        finixPaymentInstrumentId: instrument.finixPaymentInstrumentId,
        state: finixSubscription.state ?? "ACTIVE",
        amountCents: finalAmountCents,
        currency: "USD",
        billingInterval,
        collectionMethod: "BILL_AUTOMATICALLY",
        nextBillingDate: parseFinixDate(finixSubscription.next_billing_date),
        startedAt: new Date(),
        createdByUserId: actorUserId,
        consentSource: "ADMIN_CONFIRMED",
        supersedesSubscriptionId: oldSubscription.id,
        donationAmountCents: baseAmountCents,
        donorCoversFee,
        feeCalculationVersion: "v1",
        lastSyncedAt: new Date(),
      },
    }),
  ]);

  const donorName = donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name);
  await prisma.subscriptionConsent.create({
    data: {
      churchId,
      donorId: oldSubscription.donorId,
      finixSubscriptionId: finixSubscription.id,
      consentSource: "ADMIN_CONFIRMED",
      confirmedByUserId: actorUserId,
      termsVersion: TERMS_VERSION,
      recurringTermsSnapshot: { amountCents: finalAmountCents, billingInterval, replacesFinixSubscriptionId: oldSubscription.finixSubscriptionId },
      donorNameSnapshot: donorName,
      donorEmailSnapshot: donor.email,
      amountCentsSnapshot: finalAmountCents,
      frequencySnapshot: billingInterval,
      startDateSnapshot: new Date(),
      paymentMethodLastFourSnapshot: instrument.cardLast4 || instrument.bankLast4 || null,
      organizationNameSnapshot: church.name,
    },
  });

  return { oldSubscriptionId: canceledOld.id, newSubscription: newRecord };
}
