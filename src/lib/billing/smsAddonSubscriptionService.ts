import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { getSmsAddonPlan } from "@/lib/billing/smsAddonPlans";
import { resolveProcessingMerchant, buildTrustedFinixTags, buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { isSmsConfigured } from "@/lib/sms/sendText";

/**
 * Activates an organization's SMS add-on subscription — a second,
 * independent Finix subscription object from WgcSubscription (the platform
 * subscription), billed to the same on-file payment method rather than
 * folded into that one line item. Mirrors activateWgcSubscription's shape
 * (see that function's doc comment for the confirmed Finix field
 * semantics this reuses) but deliberately does NOT touch WgcSubscription
 * at all — WgcSubscription.organizationId is @unique, one row per org for
 * the platform fee; this is a separate table for exactly that reason.
 *
 * Requires the organization to already have an ACTIVE WgcBillingAccount
 * (i.e. they've already been through the platform subscription's payment
 * setup) — this add-on reuses that identity/instrument rather than
 * collecting payment details a second time.
 */

export class SmsAddonSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsAddonSubscriptionError";
  }
}

export interface ActivateSmsAddonInput {
  organizationId: string;
  planCode: string;
  actorUserId?: string;
  actorEmail?: string;
}

export async function activateSmsAddonSubscription(input: ActivateSmsAddonInput) {
  // Refuse to start charging for a feature that can't actually send
  // anything yet — donor/campaign SMS is hard-disabled until
  // TWILIO_DONOR_FROM_NUMBER is deliberately introduced alongside its own
  // approved Twilio campaign (see sendText.ts). Checked here, not just in
  // the UI, since this is the one function that actually moves money —
  // any future caller gets the same guarantee.
  if (!isSmsConfigured()) {
    throw new SmsAddonSubscriptionError("Text messaging isn't available yet — coming soon.");
  }

  const plan = getSmsAddonPlan(input.planCode);
  if (!plan) {
    throw new SmsAddonSubscriptionError(`Unknown SMS add-on plan code: ${input.planCode}`);
  }

  const billingAccount = await prisma.wgcBillingAccount.findUnique({ where: { organizationId: input.organizationId } });
  if (!billingAccount || billingAccount.status !== "ACTIVE" || !billingAccount.billingIdentityId || !billingAccount.billingPaymentInstrumentId) {
    throw new SmsAddonSubscriptionError(
      "This organization needs an active WGC platform subscription with a payment method on file before the text-messaging add-on can be activated."
    );
  }

  // Duplicate-activation guard — same upsert-on-unique-constraint pattern
  // as activateWgcSubscription: two concurrent "Subscribe" clicks race on
  // the DB unique constraint, not application logic.
  const row = await prisma.smsAddonSubscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      planCode: plan.code,
      includedTexts: plan.includedTexts,
      monthlyAmountCents: plan.monthlyAmountCents,
      overageRateCents: plan.overageRateCents,
      currency: "USD",
      billingIdentityId: billingAccount.billingIdentityId,
      billingPaymentInstrumentId: billingAccount.billingPaymentInstrumentId,
      status: "INCOMPLETE",
      createdByUserId: input.actorUserId,
    },
    update: {},
  });

  if (row.finixSubscriptionId) {
    return { subscription: row, alreadyExisted: true };
  }

  if (row.status === "CANCELED") {
    throw new SmsAddonSubscriptionError(
      "This organization's text-messaging add-on was previously canceled — reactivating requires WGC support, since it already has a Finix subscription history."
    );
  }

  const resolved = await resolveProcessingMerchant("WGC_SMS_ADDON_SUBSCRIPTION", input.organizationId);
  const tags = buildTrustedFinixTags({ organizationId: input.organizationId, chargeType: "WGC_SMS_ADDON_SUBSCRIPTION" });

  let finixSubscription: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped Finix API response, matches finix/client.ts convention
  try {
    finixSubscription = await finixClient.createSubscription({
      amount: plan.monthlyAmountCents,
      currency: "USD",
      billing_interval: "MONTHLY",
      linked_to: resolved.merchantId,
      linked_type: "MERCHANT",
      buyer_details: { identity_id: billingAccount.billingIdentityId, instrument_id: billingAccount.billingPaymentInstrumentId },
      subscription_details: { collection_method: "BILL_AUTOMATICALLY" },
      tags,
    });
  } catch (err) {
    await logBillingAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: "sms_addon_subscription.creation_failed",
      entityType: "SmsAddonSubscription",
      entityId: row.id,
      internalReason: err instanceof Error ? err.message : String(err),
    });
    throw new SmsAddonSubscriptionError(`Could not create the text-messaging subscription with Finix. ${err instanceof Error ? err.message : String(err)}`);
  }

  const finixState: string = finixSubscription?.state || "ACTIVE";
  const newStatus = finixState === "CANCELED" ? "CANCELED" : "ACTIVE";

  const updated = await prisma.$transaction(async (tx) => {
    return tx.smsAddonSubscription.update({
      where: { id: row.id },
      data: { finixSubscriptionId: finixSubscription?.id ?? null, status: newStatus },
    });
  });

  await logBillingAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    action: "sms_addon_subscription.created",
    entityType: "SmsAddonSubscription",
    entityId: updated.id,
    newValue: { planCode: plan.code, status: newStatus, monthlyAmountCents: plan.monthlyAmountCents },
    idempotencyKey: buildIdempotencyKey(input.organizationId, "sms_addon_subscription.created"),
    metadata: { finixSubscriptionId: finixSubscription?.id },
  });

  return { subscription: updated, alreadyExisted: false };
}

export async function getSmsAddonSubscription(organizationId: string) {
  return prisma.smsAddonSubscription.findUnique({ where: { organizationId } });
}

export async function isSmsAddonActive(organizationId: string): Promise<boolean> {
  const sub = await prisma.smsAddonSubscription.findUnique({ where: { organizationId }, select: { status: true } });
  return sub?.status === "ACTIVE";
}
