import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { resolveProcessingMerchant, buildTrustedFinixTags, buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

export class SmsOverageChargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsOverageChargeError";
  }
}

export interface ChargeActor {
  userId: string;
  email?: string | null;
  role?: string | null;
}

/**
 * Admin-triggered ONLY — mirrors chargePromoShortfall exactly, including
 * why: detectSmsOverages() only ever creates FLAGGED rows; a human must
 * explicitly call this to actually move money, per the "admin reviews then
 * approves each charge" design already established for promo shortfalls.
 *
 * Charges the org's on-file WGC billing payment method for the overage's
 * snapshotted chargeAmountCents, through the WGC platform-billing
 * merchant (never the organization's own donor-facing merchant).
 * Idempotent: retrying a charge that already succeeded (same overage id)
 * is a no-op.
 */
export async function chargeSmsOverage(overageId: string, actor: ChargeActor) {
  const overage = await prisma.smsAddonOverageCharge.findUnique({ where: { id: overageId } });
  if (!overage) {
    throw new SmsOverageChargeError("Overage record not found.");
  }
  if (overage.status === "CHARGED") {
    return overage; // already done — not an error, just a no-op
  }
  if (overage.status === "WAIVED") {
    throw new SmsOverageChargeError("This overage was already waived — cannot charge a waived record.");
  }

  const subscription = await prisma.smsAddonSubscription.findUnique({ where: { organizationId: overage.organizationId } });
  if (!subscription?.billingPaymentInstrumentId) {
    throw new SmsOverageChargeError("This organization has no billing payment method on file — cannot charge.");
  }

  const resolved = await resolveProcessingMerchant("WGC_SMS_ADDON_OVERAGE", overage.organizationId);
  const idempotencyKey = buildIdempotencyKey("sms-addon-overage", overage.id);
  const tags = buildTrustedFinixTags({
    organizationId: overage.organizationId,
    chargeType: "WGC_SMS_ADDON_OVERAGE",
    subscriptionId: subscription.id,
  });

  let transfer: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped Finix response, matches finix/client.ts convention
  try {
    transfer = await finixClient.createTransfer({
      merchant: resolved.merchantId,
      amount: overage.chargeAmountCents,
      currency: overage.currency,
      source: subscription.billingPaymentInstrumentId,
      idempotency_id: idempotencyKey,
      statement_descriptor: "WGC TEXT OVERAGE",
      tags: { ...tags, sms_overage_id: overage.id, billing_period: overage.billingPeriod },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.smsAddonOverageCharge.update({
      where: { id: overageId },
      data: { status: "CHARGE_FAILED", failureMessage: message },
    });
    await logBillingAuditEvent({
      organizationId: overage.organizationId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "sms_addon_overage.charge_failed",
      entityType: "SmsAddonOverageCharge",
      entityId: overage.id,
      internalReason: message,
      metadata: { billingPeriod: overage.billingPeriod, amountCents: overage.chargeAmountCents },
    });
    throw new SmsOverageChargeError(`Finix charge failed: ${message}`);
  }

  const billingCharge = await prisma.billingCharge.create({
    data: {
      organizationId: overage.organizationId,
      chargeType: "SMS_ADDON_OVERAGE",
      billingPeriod: overage.billingPeriod,
      amountCents: overage.chargeAmountCents,
      currency: overage.currency,
      finixTransferId: transfer.id,
      finixSubscriptionId: subscription.finixSubscriptionId,
      idempotencyKey: crypto.randomUUID(),
      status: String(transfer.state || "").toUpperCase() === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
      internalNote: `Text-messaging overage charge for ${overage.billingPeriod} (${overage.overageTexts} texts over the ${overage.textsIncluded}-text allowance). Triggered by ${actor.email || actor.userId}.`,
      succeededAt: String(transfer.state || "").toUpperCase() === "SUCCEEDED" ? new Date() : null,
    },
  });

  const updated = await prisma.smsAddonOverageCharge.update({
    where: { id: overageId },
    data: {
      status: "CHARGED",
      finixTransferId: transfer.id,
      billingChargeId: billingCharge.id,
      chargedByUserId: actor.userId,
      chargedAt: new Date(),
    },
  });

  await logBillingAuditEvent({
    organizationId: overage.organizationId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "sms_addon_overage.charged",
    entityType: "SmsAddonOverageCharge",
    entityId: overage.id,
    newValue: { finixTransferId: transfer.id, amountCents: overage.chargeAmountCents, billingPeriod: overage.billingPeriod },
    metadata: { billingChargeId: billingCharge.id },
  });

  return updated;
}

export async function waiveSmsOverage(overageId: string, actor: ChargeActor, reason: string) {
  const overage = await prisma.smsAddonOverageCharge.findUnique({ where: { id: overageId } });
  if (!overage) {
    throw new SmsOverageChargeError("Overage record not found.");
  }
  if (overage.status === "CHARGED") {
    throw new SmsOverageChargeError("This overage was already charged — cannot waive a charged record.");
  }
  if (overage.status === "WAIVED") {
    return overage;
  }

  const updated = await prisma.smsAddonOverageCharge.update({
    where: { id: overageId },
    data: { status: "WAIVED", waivedByUserId: actor.userId, waivedAt: new Date(), waiveReason: reason },
  });

  await logBillingAuditEvent({
    organizationId: overage.organizationId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "sms_addon_overage.waived",
    entityType: "SmsAddonOverageCharge",
    entityId: overage.id,
    internalReason: reason,
    metadata: { billingPeriod: overage.billingPeriod },
  });

  return updated;
}
