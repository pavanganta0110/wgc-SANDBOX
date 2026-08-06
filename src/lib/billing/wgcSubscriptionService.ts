import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { assertWgcBillingMerchantReady, getWgcBillingMerchantId } from "@/lib/billing/wgcBillingConfig";
import { buildTrustedFinixTags, buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Creates (or safely reuses) an organization's WGC platform subscription.
 * This is the ONLY function that calls finixClient.createSubscription for
 * WGC's own platform billing — never called from any donation/invoice
 * path.
 *
 * Duplicate-activation protection: WgcSubscription.organizationId is
 * @unique, so `upsert` here is an atomic "create the row if it doesn't
 * exist, otherwise return the existing one" — two concurrent activation
 * clicks (or a retried request) race on the same DB unique constraint, not
 * on application logic, so at most one row can ever exist per organization.
 * If that row already has a finixSubscriptionId, this function returns it
 * as-is without calling Finix again ("reuse the existing subscription when
 * creation previously succeeded" / "reconcile an uncertain timeout with
 * Finix before retrying" — see reconcileIncompleteSubscription below for
 * the timeout-recovery path).
 *
 * TRIAL FIELDS — confirmed against a real Finix sandbox POST /subscriptions
 * call (2026-08-06), not guessed: trial_details lives inside
 * subscription_details as { interval_type: "MONTH", interval_count: N },
 * never as a top-level field (Finix silently no-ops an unrecognized
 * top-level trial_details rather than erroring — confirmed by a first
 * attempt that returned 201 with state="ACTIVE" and
 * subscription_details.trial_details=null). The response has NO
 * trial_start/trial_end fields at all; trial state instead lives in
 * subscription_phase ("TRIAL" | "DISCOUNT" | "EVERGREEN"), and
 * first_charge_at IS the effective trial-end / first-real-charge date.
 * next_billing_date is a {year, month, day} object, not an ISO string.
 */

const DEFAULT_PLAN_CODE = "WGC_STANDARD";

export class WgcSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WgcSubscriptionError";
  }
}

export async function ensureDefaultPricingVersion() {
  const existing = await prisma.wgcPricingVersion.findFirst({
    where: { planCode: DEFAULT_PLAN_CODE, status: "ACTIVE", isDefaultForNewOrgs: true },
    orderBy: { effectiveFrom: "desc" },
  });
  if (existing) return existing;
  return prisma.wgcPricingVersion.create({
    data: {
      planCode: DEFAULT_PLAN_CODE,
      planName: "WGC Platform",
      monthlyAmountCents: 1000,
      currency: "USD",
      billingInterval: "MONTHLY",
      isDefaultForNewOrgs: true,
      status: "ACTIVE",
      customerDescription: "The WGC Payments platform subscription.",
    },
  });
}

export interface ActivateSubscriptionInput {
  organizationId: string;
  billingIdentityId: string;
  billingPaymentInstrumentId: string;
  actorUserId?: string;
  actorEmail?: string;
}

export interface ActivateSubscriptionResult {
  subscription: {
    id: string;
    finixSubscriptionId: string | null;
    status: string;
    trialStartsAt: Date | null;
    trialEndsAt: Date | null;
    firstChargeAt: Date | null;
    nextChargeAt: Date | null;
    amountCents: number;
    currency: string;
  };
  isPromotional: boolean;
  alreadyExisted: boolean;
}

export async function activateWgcSubscription(input: ActivateSubscriptionInput): Promise<ActivateSubscriptionResult> {
  const merchantStatus = await assertWgcBillingMerchantReady();
  const pricing = await ensureDefaultPricingVersion();

  // Duplicate-activation guard — see module doc comment.
  const row = await prisma.wgcSubscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      planCode: pricing.planCode,
      priceVersionId: pricing.id,
      finixBillingMerchantId: merchantStatus.merchantId,
      billingIdentityId: input.billingIdentityId,
      billingPaymentInstrumentId: input.billingPaymentInstrumentId,
      amountCents: pricing.monthlyAmountCents,
      currency: pricing.currency,
      billingInterval: pricing.billingInterval,
      status: "INCOMPLETE",
    },
    update: {},
  });

  if (row.finixSubscriptionId) {
    return {
      subscription: {
        id: row.id,
        finixSubscriptionId: row.finixSubscriptionId,
        status: row.status,
        trialStartsAt: row.trialStartsAt,
        trialEndsAt: row.trialEndsAt,
        firstChargeAt: row.firstChargeAt,
        nextChargeAt: row.nextChargeAt,
        amountCents: row.amountCents,
        currency: row.currency,
      },
      isPromotional: row.status === "TRIALING",
      alreadyExisted: true,
    };
  }

  const entitlement = await prisma.promotionEntitlement.findFirst({
    where: { organizationId: input.organizationId, status: "AWAITING_BILLING_SETUP" },
    orderBy: { createdAt: "desc" },
  });
  const isPromotional = Boolean(entitlement);

  const tags = buildTrustedFinixTags({
    organizationId: input.organizationId,
    chargeType: "WGC_PLATFORM_SUBSCRIPTION",
  });

  let finixSubscription: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped Finix API response, matches finix/client.ts convention
  try {
    finixSubscription = await finixClient.createSubscription({
      amount: pricing.monthlyAmountCents,
      currency: pricing.currency,
      billing_interval: "MONTHLY",
      linked_to: merchantStatus.merchantId,
      linked_type: "MERCHANT",
      buyer_details: { identity_id: input.billingIdentityId, instrument_id: input.billingPaymentInstrumentId },
      subscription_details: {
        collection_method: "BILL_AUTOMATICALLY",
        ...(isPromotional && entitlement
          ? { trial_details: { interval_type: "MONTH" as const, interval_count: entitlement.durationMonths } }
          : {}),
      },
      tags,
    });
  } catch (err) {
    await logBillingAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: "subscription.creation_failed",
      entityType: "WgcSubscription",
      entityId: row.id,
      internalReason: err instanceof Error ? err.message : String(err),
    });
    throw new WgcSubscriptionError(
      `Could not create the WGC platform subscription with Finix. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Field names confirmed against a real Finix response — see module doc
  // comment. subscription_phase (not state) indicates TRIAL; there are no
  // trial_start/trial_end fields, so trialStartsAt derives from
  // start_subscription_at and trialEndsAt/firstChargeAt both derive from
  // first_charge_at (the one date Finix actually returns for "when does
  // the trial end and the first real charge happen").
  const subscriptionPhase: string | undefined = finixSubscription?.subscription_phase;
  const isTrialPhase = subscriptionPhase === "TRIAL";
  const trialStartsAt = finixSubscription?.start_subscription_at
    ? new Date(finixSubscription.start_subscription_at)
    : isPromotional
      ? new Date()
      : null;
  const firstChargeAt = finixSubscription?.first_charge_at ? new Date(finixSubscription.first_charge_at) : null;
  const trialEndsAt = isTrialPhase ? firstChargeAt : null;
  const nextBillingDate = finixSubscription?.next_billing_date;
  const nextChargeAt =
    nextBillingDate && typeof nextBillingDate === "object"
      ? new Date(Date.UTC(nextBillingDate.year, nextBillingDate.month - 1, nextBillingDate.day))
      : firstChargeAt;
  const finixState: string = finixSubscription?.state || "ACTIVE";
  const newStatus = isTrialPhase ? "TRIALING" : finixState === "CANCELED" ? "CANCELED" : "ACTIVE";

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRow = await tx.wgcSubscription.update({
      where: { id: row.id },
      data: {
        finixSubscriptionId: finixSubscription?.id ?? null,
        status: newStatus,
        trialStartsAt,
        trialEndsAt,
        firstChargeAt,
        nextChargeAt,
        lastSyncedAt: new Date(),
      },
    });

    await tx.wgcBillingAccount.update({
      where: { organizationId: input.organizationId },
      data: { status: "ACTIVE" },
    });

    await tx.church.update({
      where: { id: input.organizationId },
      data: { billingSetupStatus: "BILLING_ACTIVE" },
    });

    if (entitlement) {
      await tx.promotionEntitlement.update({
        where: { id: entitlement.id },
        data: {
          status: "ACTIVE",
          startsAt: trialStartsAt,
          endsAt: trialEndsAt,
          firstPaidBillingDate: firstChargeAt,
          finixSubscriptionId: finixSubscription?.id ?? null,
        },
      });
    }

    return updatedRow;
  });

  await logBillingAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    action: "subscription.created",
    entityType: "WgcSubscription",
    entityId: updated.id,
    newValue: { status: newStatus, trialStartsAt, trialEndsAt, firstChargeAt, nextChargeAt },
    idempotencyKey: buildIdempotencyKey(input.organizationId, "subscription.created"),
    metadata: { finixSubscriptionId: finixSubscription?.id, finixBillingMerchantId: getWgcBillingMerchantId() },
  });
  if (isPromotional) {
    await logBillingAuditEvent({
      organizationId: input.organizationId,
      action: "trial.started",
      entityType: "WgcSubscription",
      entityId: updated.id,
      newValue: { trialStartsAt, trialEndsAt },
    });
  }

  return {
    subscription: {
      id: updated.id,
      finixSubscriptionId: updated.finixSubscriptionId,
      status: updated.status,
      trialStartsAt: updated.trialStartsAt,
      trialEndsAt: updated.trialEndsAt,
      firstChargeAt: updated.firstChargeAt,
      nextChargeAt: updated.nextChargeAt,
      amountCents: updated.amountCents,
      currency: updated.currency,
    },
    isPromotional,
    alreadyExisted: false,
  };
}
