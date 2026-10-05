import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { resolveProcessingMerchant, buildTrustedFinixTags, buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

export class PromoShortfallChargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoShortfallChargeError";
  }
}

export interface ChargeActor {
  userId: string;
  email?: string | null;
  role?: string | null;
}

/**
 * Admin-triggered ONLY — there is no automatic/cron path that calls this.
 * detectPromoShortfalls() (promoShortfallDetection.ts) only ever creates
 * FLAGGED rows; a human must explicitly call this to actually move money,
 * per the "admin reviews then approves each charge" design.
 *
 * Charges the org's on-file WGC billing payment method for the shortfall's
 * snapshotted chargeAmountCents, through the WGC platform-billing merchant
 * (never the organization's own donor-facing merchant — see
 * paymentRouting.ts). Idempotent: retrying a charge that already succeeded
 * (same shortfall id) is a no-op, matching the same idempotency_id/unique-
 * constraint pattern used for every other Finix charge in this codebase.
 */
export async function chargePromoShortfall(shortfallId: string, actor: ChargeActor) {
  const shortfall = await prisma.promoShortfallCharge.findUnique({ where: { id: shortfallId } });
  if (!shortfall) {
    throw new PromoShortfallChargeError("Shortfall record not found.");
  }
  if (shortfall.status === "CHARGED") {
    return shortfall; // already done — not an error, just a no-op
  }
  if (shortfall.status === "WAIVED") {
    throw new PromoShortfallChargeError("This shortfall was already waived — cannot charge a waived record.");
  }

  const subscription = await prisma.wgcSubscription.findUnique({ where: { organizationId: shortfall.organizationId } });
  if (!subscription?.billingPaymentInstrumentId) {
    throw new PromoShortfallChargeError("This organization has no billing payment method on file — cannot charge.");
  }

  const resolved = await resolveProcessingMerchant("WGC_PLATFORM_SUBSCRIPTION", shortfall.organizationId);
  const idempotencyKey = buildIdempotencyKey("promo-shortfall", shortfall.id);
  const tags = buildTrustedFinixTags({
    organizationId: shortfall.organizationId,
    chargeType: "WGC_PLATFORM_SUBSCRIPTION",
    subscriptionId: subscription.id,
  });

  let transfer: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped Finix response, matches finix/client.ts convention
  try {
    transfer = await finixClient.createTransfer({
      merchant: resolved.merchantId,
      amount: shortfall.chargeAmountCents,
      currency: shortfall.currency,
      source: subscription.billingPaymentInstrumentId,
      idempotency_id: idempotencyKey,
      statement_descriptor: "WGC PLATFORM",
      tags: { ...tags, promo_shortfall_id: shortfall.id, billing_period: shortfall.billingPeriod },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.promoShortfallCharge.update({
      where: { id: shortfallId },
      data: { status: "CHARGE_FAILED", failureMessage: message },
    });
    await logBillingAuditEvent({
      organizationId: shortfall.organizationId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "promo_shortfall.charge_failed",
      entityType: "PromoShortfallCharge",
      entityId: shortfall.id,
      internalReason: message,
      metadata: { billingPeriod: shortfall.billingPeriod, amountCents: shortfall.chargeAmountCents },
    });
    throw new PromoShortfallChargeError(`Finix charge failed: ${message}`);
  }

  const billingCharge = await prisma.billingCharge.create({
    data: {
      organizationId: shortfall.organizationId,
      chargeType: "BILLING_ADJUSTMENT",
      billingPeriod: shortfall.billingPeriod,
      amountCents: shortfall.chargeAmountCents,
      currency: shortfall.currency,
      finixTransferId: transfer.id,
      finixSubscriptionId: subscription.finixSubscriptionId,
      pricingVersionId: subscription.priceVersionId,
      idempotencyKey: crypto.randomUUID(),
      status: String(transfer.state || "").toUpperCase() === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
      internalNote: `Promo minimum-processing shortfall charge for ${shortfall.billingPeriod} (processed ${shortfall.processedVolumeCents} of ${shortfall.thresholdCents} cent minimum). Triggered by ${actor.email || actor.userId}.`,
      succeededAt: String(transfer.state || "").toUpperCase() === "SUCCEEDED" ? new Date() : null,
    },
  });

  const updated = await prisma.promoShortfallCharge.update({
    where: { id: shortfallId },
    data: {
      status: "CHARGED",
      finixTransferId: transfer.id,
      billingChargeId: billingCharge.id,
      chargedByUserId: actor.userId,
      chargedAt: new Date(),
    },
  });

  await logBillingAuditEvent({
    organizationId: shortfall.organizationId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "promo_shortfall.charged",
    entityType: "PromoShortfallCharge",
    entityId: shortfall.id,
    newValue: { finixTransferId: transfer.id, amountCents: shortfall.chargeAmountCents, billingPeriod: shortfall.billingPeriod },
    metadata: { billingChargeId: billingCharge.id },
  });

  return updated;
}

export async function waivePromoShortfall(shortfallId: string, actor: ChargeActor, reason: string) {
  const shortfall = await prisma.promoShortfallCharge.findUnique({ where: { id: shortfallId } });
  if (!shortfall) {
    throw new PromoShortfallChargeError("Shortfall record not found.");
  }
  if (shortfall.status === "CHARGED") {
    throw new PromoShortfallChargeError("This shortfall was already charged — cannot waive a charged record.");
  }
  if (shortfall.status === "WAIVED") {
    return shortfall;
  }

  const updated = await prisma.promoShortfallCharge.update({
    where: { id: shortfallId },
    data: { status: "WAIVED", waivedByUserId: actor.userId, waivedAt: new Date(), waiveReason: reason },
  });

  await logBillingAuditEvent({
    organizationId: shortfall.organizationId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "promo_shortfall.waived",
    entityType: "PromoShortfallCharge",
    entityId: shortfall.id,
    internalReason: reason,
    metadata: { billingPeriod: shortfall.billingPeriod },
  });

  return updated;
}
