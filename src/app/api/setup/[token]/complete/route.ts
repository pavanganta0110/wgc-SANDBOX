import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { hashSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { checkSetupLinkRateLimit } from "@/lib/subscriptions/setupLinkRateLimit";
import { isValidEmail, normalizePhone } from "@/lib/donors/donorContact";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";

const TERMS_VERSION = "2026-01-recurring-donor-v1";

/**
 * Public, unauthenticated completion of a donor-initiated recurring setup.
 * Mirrors the exact tokenization pattern already used by /api/g/[slug]/donate:
 * the browser only ever sends an opaque Finix.js token (or wallet token),
 * never raw card/bank data. Terms (amount/frequency/dates) always come from
 * the server-stored SubscriptionSetupLink row — never from the request body
 * — so a tampered client request cannot alter what the donor is charged.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkSetupLinkRateLimit(`complete:${ip}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json();
  const { finixToken, donorFirstName, donorLastName, donorPhone, consentAccepted } = body;

  if (!finixToken) return NextResponse.json({ error: "Missing payment token" }, { status: 400 });
  if (consentAccepted !== true) return NextResponse.json({ error: "You must accept the recurring donation terms to continue" }, { status: 400 });

  const tokenHash = hashSetupLinkToken(token);

  // Atomic single-use claim: only the request that flips SENT/PENDING ->
  // COMPLETING wins; a concurrent double-submit (double-click, network
  // retry) sees count === 0 and is rejected rather than creating two
  // subscriptions from one link.
  const claim = await prisma.subscriptionSetupLink.updateMany({
    where: { tokenHash, status: { in: ["PENDING", "SENT"] }, expiresAt: { gt: new Date() } },
    data: { status: "COMPLETING" },
  });
  if (claim.count === 0) {
    const existing = await prisma.subscriptionSetupLink.findUnique({ where: { tokenHash } });
    if (existing?.status === "COMPLETED") return NextResponse.json({ error: "This setup link has already been used." }, { status: 410 });
    if (existing?.status === "REVOKED") return NextResponse.json({ error: "This setup link has been revoked." }, { status: 410 });
    return NextResponse.json({ error: "This setup link is invalid or has expired." }, { status: 410 });
  }

  const link = await prisma.subscriptionSetupLink.findUnique({ where: { tokenHash } });
  if (!link) return NextResponse.json({ error: "This setup link is invalid." }, { status: 404 });

  try {
    const church = await prisma.church.findUnique({ where: { id: link.churchId } });
    if (!church?.finixMerchantId) throw new Error("Organization is not fully onboarded");

    const firstName = (donorFirstName || link.donorFirstName || "").trim();
    const lastName = (donorLastName || link.donorLastName || "").trim();
    const email = link.donorEmail;
    if (!isValidEmail(email)) throw new Error("Invalid donor email on file");
    const normalizedPhone = donorPhone ? normalizePhone(donorPhone) : null;

    const identity = await finixClient.createBuyerIdentity({
      entity: { first_name: firstName || "Donor", last_name: lastName || "Donor", email, phone: normalizedPhone || undefined },
    });
    const identityId = identity?.id;
    if (!identityId) throw new Error("Failed to create buyer identity");

    const instrument = await finixClient.createPaymentInstrument({ identity: identityId, token: finixToken, type: "TOKEN" });
    const instrumentId = instrument?.id;
    if (!instrumentId) throw new Error("Failed to create payment instrument");

    const donorRecord = await prisma.donor.upsert({
      where: { finixIdentityId: identityId },
      create: { churchId: link.churchId, finixIdentityId: identityId, name: `${firstName} ${lastName}`.trim() || null, email, phone: normalizedPhone },
      update: { name: `${firstName} ${lastName}`.trim() || undefined, phone: normalizedPhone ?? undefined },
    });

    try {
      await syncPaymentInstrument(instrumentId, { churchId: link.churchId, donorId: donorRecord.id });
    } catch (err) {
      console.error("Failed to snapshot payment instrument for setup-link completion:", err);
    }

    const finixSubscription = await finixClient.createSubscription({
      amount: link.amountCents,
      currency: "USD",
      billing_interval: link.billingInterval as any,
      linked_to: church.finixMerchantId,
      linked_type: "MERCHANT",
      buyer_details: { identity_id: identityId, instrument_id: instrumentId },
      tags: { source: "wgc_setup_link", churchId: link.churchId, setupLinkId: link.id },
    });
    if (!finixSubscription?.id) throw new Error("Failed to create subscription");

    const instrumentSnapshot = await prisma.finixPaymentInstrumentSnapshot.findUnique({ where: { finixPaymentInstrumentId: instrumentId } });

    // A payment-update-link completion cancels the referenced subscription
    // (Finix has no in-place "change payment method" endpoint) and chains
    // the replacement, rather than leaving the old subscription active and
    // creating an unrelated second one.
    let oldSubscriptionForUpdate: { id: string; finixSubscriptionId: string } | null = null;
    if (link.updateTargetFinixSubscriptionId) {
      oldSubscriptionForUpdate = await prisma.finixSubscription.findFirst({
        where: { finixSubscriptionId: link.updateTargetFinixSubscriptionId, churchId: link.churchId },
        select: { id: true, finixSubscriptionId: true },
      });
      if (oldSubscriptionForUpdate) {
        await finixClient.cancelSubscription(oldSubscriptionForUpdate.finixSubscriptionId);
      }
    }

    await prisma.finixSubscription.create({
      data: {
        finixSubscriptionId: finixSubscription.id,
        churchId: link.churchId,
        donorId: donorRecord.id,
        fundId: link.fundId,
        finixMerchantId: church.finixMerchantId,
        finixBuyerIdentityId: identityId,
        finixPaymentInstrumentId: instrumentId,
        state: finixSubscription.state ?? "ACTIVE",
        amountCents: link.amountCents,
        currency: "USD",
        billingInterval: link.billingInterval,
        collectionMethod: "BILL_AUTOMATICALLY",
        nextBillingDate: parseFinixDate(finixSubscription.next_billing_date),
        startedAt: link.startDate,
        consentSource: "DONOR_DIRECT",
        supersedesSubscriptionId: oldSubscriptionForUpdate?.id ?? null,
        lastSyncedAt: new Date(),
      },
    });

    if (oldSubscriptionForUpdate) {
      await prisma.finixSubscription.update({
        where: { id: oldSubscriptionForUpdate.id },
        data: { canceledAt: new Date(), cancelReason: "Replaced via donor payment method update", state: "CANCELED", lastSyncedAt: new Date() },
      });
    }

    await prisma.subscriptionConsent.create({
      data: {
        churchId: link.churchId,
        donorId: donorRecord.id,
        finixSubscriptionId: finixSubscription.id,
        consentSource: "DONOR_DIRECT",
        termsVersion: TERMS_VERSION,
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent: req.headers.get("user-agent") || null,
        setupLinkId: link.id,
        recurringTermsSnapshot: {
          amountCents: link.amountCents,
          billingInterval: link.billingInterval,
          startDate: link.startDate.toISOString(),
          endDate: link.endDate?.toISOString() ?? null,
          organizationName: church.name,
        },
        donorNameSnapshot: `${firstName} ${lastName}`.trim(),
        donorEmailSnapshot: email,
        amountCentsSnapshot: link.amountCents,
        frequencySnapshot: link.billingInterval,
        startDateSnapshot: link.startDate,
        paymentMethodLastFourSnapshot: instrumentSnapshot?.cardLast4 || instrumentSnapshot?.bankLast4 || null,
        organizationNameSnapshot: church.name,
      },
    });

    await prisma.subscriptionSetupLink.update({
      where: { id: link.id },
      data: { status: "COMPLETED", completedAt: new Date(), donorId: donorRecord.id, finixSubscriptionId: finixSubscription.id },
    });

    await sendWgcEmail({
      to: email,
      subject: `Your recurring donation to ${church.name} is set up`,
      title: "Recurring Donation Confirmed",
      badgeText: "Confirmed",
      badgeColor: "#10B981",
      bodyHtml: `<p>Thank you! Your recurring donation of <strong>${formatCents(link.amountCents)}</strong> (${frequencyLabel(link.billingInterval)}) to ${church.name} has been set up.</p>`,
    });

    if (church.primaryContactEmail) {
      await sendWgcEmail({
        to: church.primaryContactEmail,
        subject: `New recurring donation set up — ${formatCents(link.amountCents)}/${frequencyLabel(link.billingInterval)}`,
        title: "New Recurring Donation",
        badgeText: "New",
        badgeColor: "#10B981",
        bodyHtml: `<p>${firstName} ${lastName} (${email}) set up a recurring donation of ${formatCents(link.amountCents)}, ${frequencyLabel(link.billingInterval)}.</p>`,
      });
    }

    return NextResponse.json({
      success: true,
      donorName: `${firstName} ${lastName}`.trim(),
      amountCents: link.amountCents,
      billingInterval: link.billingInterval,
      nextBillingDate: parseFinixDate(finixSubscription.next_billing_date),
      paymentMethodLastFour: instrumentSnapshot?.cardLast4 || instrumentSnapshot?.bankLast4 || null,
    });
  } catch (err: any) {
    // Release the claim so the donor can retry with the same link rather
    // than being permanently locked out by a transient Finix API failure.
    await prisma.subscriptionSetupLink.update({
      where: { id: link.id },
      data: { status: "SENT", failureReason: err.message || "Setup failed" },
    });
    return NextResponse.json({ error: "We couldn't set up your recurring donation. Please check your payment details and try again." }, { status: 502 });
  }
}
