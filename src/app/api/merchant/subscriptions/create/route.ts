import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { SUPPORTED_SUBSCRIPTION_FREQUENCIES } from "@/lib/subscriptions/subscriptionStatus";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolvePaymentAttributionFromGivingLink } from "@/lib/auth/attributionSnapshot";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

const TERMS_VERSION = "2026-01-recurring-admin-v1";

/**
 * Flow 1 — Use Existing Payment Method. The Organization Admin selects a
 * donor and one of that donor's own already-tokenized, enabled payment
 * methods; no raw card/bank fields are ever accepted here. Requires
 * explicit documented consent confirmation before any Finix API call is
 * made — see section 26 of the spec.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Team-access Checkpoint 4: getSubscriptionPermissions() is now composed
  // from the centralized role-permission matrix (canCreate = canManageRecurring,
  // true for owner/admin, false for fundraiser/viewer) — no inline role
  // check needed anymore.
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canCreate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = auth.churchId;

  const body = await req.json();
  const {
    donorId,
    paymentInstrumentId,
    amountCents,
    billingInterval,
    startDate: startDateStr,
    endDate: endDateStr,
    fundId,
    givingLinkId,
    internalNote,
    consentConfirmed,
    idempotencyKey,
  } = body;

  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });
  }

  // Idempotency: a prior request with this exact key that already completed
  // returns its result rather than creating a second subscription; one
  // still in flight is rejected as a conflict rather than double-processed.
  const existingAction = await prisma.subscriptionAction.findUnique({ where: { idempotencyKey } });
  if (existingAction) {
    if (existingAction.state === "COMPLETED") {
      return NextResponse.json({ subscription: existingAction.newValue, idempotent: true });
    }
    if (existingAction.state === "PENDING") {
      return NextResponse.json({ error: "This request is already being processed" }, { status: 409 });
    }
    // FAILED — fall through and retry.
  }

  if (!donorId || !paymentInstrumentId) {
    return NextResponse.json({ error: "donorId and paymentInstrumentId are required" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents < 100) {
    return NextResponse.json({ error: "Please enter a valid recurring amount of at least $1.00" }, { status: 400 });
  }
  if (!SUPPORTED_SUBSCRIPTION_FREQUENCIES.includes(billingInterval)) {
    return NextResponse.json({ error: "Unsupported frequency" }, { status: 400 });
  }
  const startDate = startDateStr ? new Date(startDateStr) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Please provide a valid start date" }, { status: 400 });
  }
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDateStr && (!endDate || Number.isNaN(endDate.getTime()))) {
    return NextResponse.json({ error: "Please provide a valid end date" }, { status: 400 });
  }
  if (consentConfirmed !== true) {
    return NextResponse.json({ error: "Donor consent confirmation is required" }, { status: 400 });
  }

  // Ownership validation — never trust donorId/paymentInstrumentId from the
  // browser without confirming both belong to this organization, and that
  // the instrument belongs to exactly this donor.
  const [donor, instrument, church] = await Promise.all([
    prisma.donor.findFirst({ where: { id: donorId, churchId, archivedAt: null } }),
    prisma.finixPaymentInstrumentSnapshot.findFirst({ where: { finixPaymentInstrumentId: paymentInstrumentId, churchId, donorId } }),
    prisma.church.findUnique({ where: { id: churchId } }),
  ]);
  if (!donor) return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  if (!instrument) return NextResponse.json({ error: "Payment method not found for this donor" }, { status: 404 });
  if (!church?.finixMerchantId) return NextResponse.json({ error: "Organization is not fully onboarded" }, { status: 400 });
  if (instrument.enabled === false) return NextResponse.json({ error: "This payment method is disabled" }, { status: 400 });
  if (instrument.state && instrument.state.toUpperCase() === "DELETED") return NextResponse.json({ error: "This payment method has been removed" }, { status: 400 });
  if (instrument.cardExpirationMonth && instrument.cardExpirationYear) {
    const expiry = new Date(instrument.cardExpirationYear, instrument.cardExpirationMonth, 1);
    if (expiry < new Date()) return NextResponse.json({ error: "This payment method has expired" }, { status: 400 });
  }
  if (!instrument.finixIdentityId) return NextResponse.json({ error: "This payment method is missing identity information" }, { status: 400 });

  if (fundId) {
    const fund = await prisma.fund.findFirst({ where: { id: fundId, churchId } });
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }
  let givingLink: { ownerUserId: string | null; churchId: string } | null = null;
  if (givingLinkId) {
    givingLink = await prisma.givingLink.findFirst({
      where: { id: givingLinkId, churchId },
      select: { ownerUserId: true, churchId: true },
    });
    if (!givingLink) return NextResponse.json({ error: "Giving Link not found" }, { status: 404 });
  }

  // Team-access Checkpoint 3: same "default to acting user" reasoning as
  // Take a Payment — this admin-created-subscription flow has no "assign to
  // another user" control either. When a giving link is attached, its
  // owner takes precedence (matches the public-donation attribution rule).
  const attributedUserId = givingLink
    ? resolvePaymentAttributionFromGivingLink(givingLink, churchId)
    : auth.userId;

  await prisma.subscriptionAction.create({
    data: {
      churchId,
      finixSubscriptionId: "pending",
      actionType: "CREATE",
      idempotencyKey,
      requestedByUserId: auth.userId,
      newValue: { donorId, amountCents, billingInterval },
      state: "PENDING",
    },
  });

  try {
    const donorName = donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name);
    const finixSubscription = await finixClient.createSubscription({
      amount: amountCents,
      currency: "USD",
      billing_interval: billingInterval,
      linked_to: church.finixMerchantId,
      linked_type: "MERCHANT",
      buyer_details: { identity_id: instrument.finixIdentityId, instrument_id: instrument.finixPaymentInstrumentId },
      tags: { source: "wgc_admin_created", churchId, donorId },
    });
    if (!finixSubscription?.id) throw new Error("Failed to create subscription");

    const record = await prisma.finixSubscription.create({
      data: {
        finixSubscriptionId: finixSubscription.id,
        churchId,
        donorId,
        fundId: fundId || null,
        givingLinkId: givingLinkId || null,
        attributedUserId,
        finixMerchantId: church.finixMerchantId,
        finixBuyerIdentityId: instrument.finixIdentityId,
        finixPaymentInstrumentId: instrument.finixPaymentInstrumentId,
        state: finixSubscription.state ?? "ACTIVE",
        amountCents,
        currency: "USD",
        billingInterval,
        collectionMethod: "BILL_AUTOMATICALLY",
        nextBillingDate: parseFinixDate(finixSubscription.next_billing_date),
        startedAt: startDate,
        createdByUserId: auth.userId,
        consentSource: "ADMIN_CONFIRMED",
        lastSyncedAt: new Date(),
      },
    });

    const recurringTermsSnapshot = {
      amountCents,
      billingInterval,
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString() ?? null,
      fundId: fundId || null,
      organizationName: church.name,
      internalNote: internalNote || null,
    };

    await prisma.subscriptionConsent.create({
      data: {
        churchId,
        donorId,
        finixSubscriptionId: finixSubscription.id,
        consentSource: "ADMIN_CONFIRMED",
        confirmedByUserId: auth.userId,
        termsVersion: TERMS_VERSION,
        recurringTermsSnapshot,
        donorNameSnapshot: donorName,
        donorEmailSnapshot: donor.email,
        amountCentsSnapshot: amountCents,
        frequencySnapshot: billingInterval,
        startDateSnapshot: startDate,
        paymentMethodLastFourSnapshot: instrument.cardLast4 || instrument.bankLast4 || null,
        organizationNameSnapshot: church.name,
      },
    });

    const resultPayload = {
      id: record.id,
      finixSubscriptionId: finixSubscription.id,
      donorName,
      amountCents,
      billingInterval,
      startDate: startDate.toISOString(),
      nextBillingDate: record.nextBillingDate,
      paymentMethodLastFour: instrument.cardLast4 || instrument.bankLast4 || null,
    };

    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "COMPLETED", finixSubscriptionId: finixSubscription.id, newValue: resultPayload, completedAt: new Date() },
    });

    await logDashboardAction({
      churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "subscription.created_by_admin",
      entityType: "subscription",
      entityId: record.id,
      metadata: { donorId, amountCents, billingInterval, paymentMethodLastFour: resultPayload.paymentMethodLastFour },
      req,
    });

    return NextResponse.json({ subscription: resultPayload });
  } catch (err: any) {
    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "FAILED", failureReason: err.message || "Failed to create subscription" },
    });
    return NextResponse.json({ error: "Subscription was not created. Please try again." }, { status: 502 });
  }
}
