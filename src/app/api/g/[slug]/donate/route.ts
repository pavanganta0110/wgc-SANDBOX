import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { calculateFeeCoveredTotal } from "@/lib/giving/feeCalculator";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { sendReceiptEmail } from "@/lib/giving/sendReceiptEmail";
import { normalizeUSPhone, isValidEmail } from "@/lib/validation";
import { isGivingLinkUsable } from "@/lib/givingLinks/status";
import { parseDonorFieldSettings, parseAllowedPaymentMethods, parseAllowedFrequencies } from "@/lib/givingLinks/types";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // One-time links that got atomically claimed (status flipped ACTIVE ->
  // INACTIVE below) but then failed before a Finix charge was attempted
  // must be released back to ACTIVE so a failed/aborted attempt never
  // permanently burns the link — tracked here so every early-return path
  // below can release it.
  let claimedOneTimeLinkId: string | null = null;

  try {
    const body = await req.json();
    const {
      token,
      // Digital-wallet flows (Apple Pay / Google Pay) bypass Finix.js's
      // card/bank tokenization form entirely — the browser gets an
      // already-encrypted wallet token directly from Apple/Google's own
      // JS SDK, plus the billing contact the wallet collected. This is
      // never written to the database; it's read once here and handed
      // straight to Finix.
      walletToken,
      walletBillingContact,
      donationAmountCents,
      coverFees,
      isRecurring,
      billingInterval,
      paymentMethod,
      fraudSessionId,
      donor,
    } = body;

    const isWallet = paymentMethod === "apple_pay" || paymentMethod === "google_pay";

    if (!donationAmountCents || donationAmountCents < 100) {
      return NextResponse.json({ error: "Invalid donation amount" }, { status: 400 });
    }
    if (isWallet ? !walletToken : !token) {
      return NextResponse.json({ error: "Missing payment token" }, { status: 400 });
    }
    if (!fraudSessionId) {
      return NextResponse.json({ error: "Missing fraud session" }, { status: 400 });
    }

    const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug } });
    if (!link) {
      return NextResponse.json({ error: "This giving link could not be found" }, { status: 404 });
    }

    const usable = isGivingLinkUsable(link);
    if (!usable.usable) {
      const message =
        usable.reason === "already_used"
          ? "This giving link has already been used"
          : usable.reason === "expired"
            ? "This giving link has expired"
            : "This giving link is not currently accepting gifts";
      return NextResponse.json({ error: message, reason: usable.reason }, { status: 410 });
    }

    const church = await prisma.church.findUnique({ where: { id: link.churchId } });
    if (!church || !church.finixMerchantId) {
      return NextResponse.json({ error: "This organization cannot accept gifts right now" }, { status: 400 });
    }

    // Amount rules
    if (link.amountType === "FIXED") {
      if (link.fixedAmountCents != null && donationAmountCents !== link.fixedAmountCents) {
        return NextResponse.json({ error: "This giving link only accepts a fixed donation amount" }, { status: 400 });
      }
    } else {
      if (link.minAmountCents != null && donationAmountCents < link.minAmountCents) {
        return NextResponse.json({ error: "Donation amount is below the minimum for this link" }, { status: 400 });
      }
      if (link.maxAmountCents != null && donationAmountCents > link.maxAmountCents) {
        return NextResponse.json({ error: "Donation amount is above the maximum for this link" }, { status: 400 });
      }
    }

    const allowedMethods = parseAllowedPaymentMethods(link.allowedPaymentMethodsJson);
    const method: "card" | "bank" = paymentMethod === "bank" ? "bank" : "card";
    const methodCheck =
      paymentMethod === "apple_pay"
        ? allowedMethods.includes("APPLE_PAY")
        : paymentMethod === "google_pay"
          ? allowedMethods.includes("GOOGLE_PAY")
          : method === "card"
            ? allowedMethods.includes("CARD")
            : allowedMethods.includes("BANK");
    if (!methodCheck) {
      return NextResponse.json({ error: "This payment method is not accepted for this giving link" }, { status: 400 });
    }
    if (isWallet && (!walletBillingContact?.name || !walletBillingContact?.address)) {
      return NextResponse.json({ error: "Missing billing information from wallet" }, { status: 400 });
    }

    if (isRecurring && !link.recurringEnabled) {
      return NextResponse.json({ error: "Recurring giving is not available for this giving link" }, { status: 400 });
    }
    const allowedFrequencies = parseAllowedFrequencies(link.allowedFrequenciesJson);
    const interval = allowedFrequencies.includes(billingInterval) ? billingInterval : allowedFrequencies[0];

    // Donor-field validation, driven by this link's configured visibility.
    // Wallet checkouts collect name/address from Apple/Google's own contact
    // sheet rather than this link's donor-field form, so that's the fallback
    // source of truth for fullName/email when the manual fields are empty.
    const fieldSettings = parseDonorFieldSettings(link.donorFieldSettingsJson);
    const fullName =
      [donor?.firstName, donor?.lastName].filter(Boolean).join(" ").trim() ||
      donor?.name?.trim() ||
      (isWallet ? walletBillingContact?.name?.trim() : undefined);
    if (fieldSettings.firstName === "REQUIRED" || fieldSettings.lastName === "REQUIRED" || fieldSettings.email === "REQUIRED") {
      if (!fullName) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
    }
    if (fieldSettings.email === "REQUIRED" && !donor?.email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (donor?.email && !isValidEmail(donor.email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (donor?.phone) {
      const normalized = normalizeUSPhone(donor.phone);
      if (fieldSettings.phone === "REQUIRED" && !normalized) {
        return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
      }
      if (normalized) donor.phone = normalized;
    }
    if (!fullName || !donor?.email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Server is the source of truth for the charged amount — never trust a
    // client-supplied total, and reuse the same donor-cover formula as the
    // main WGC giving page rather than a second implementation.
    const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
    const { totalCents } = link.feeCoverEnabled && coverFees
      ? calculateFeeCoveredTotal(donationAmountCents, method, {
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        })
      : { totalCents: donationAmountCents };
    const feeCoveredCents = totalCents - donationAmountCents;

    // One-time links: atomically claim the link before charging so two
    // concurrent submits can't both succeed — only the request that flips
    // ACTIVE -> INACTIVE proceeds; the loser sees "already used".
    if ((link.linkType || "MULTI_USE").toUpperCase() === "ONE_TIME") {
      const claim = await prisma.givingLink.updateMany({
        where: { id: link.id, status: "ACTIVE" },
        data: { status: "INACTIVE" },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This giving link has already been used", reason: "already_used" }, { status: 410 });
      }
      claimedOneTimeLinkId = link.id;
    }

    const [firstName, ...rest] = fullName.trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const identity = await finixClient.createBuyerIdentity({
      entity: {
        first_name: firstName,
        last_name: lastName,
        email: donor.email,
        phone: donor.phone || undefined,
      },
    });
    const identityId = identity?.id;
    if (!identityId) throw new Error("Failed to create buyer identity");

    // Wallet payment instruments are created from the encrypted token
    // Apple/Google's SDK produced, per docs.finix.com/guides/online-payments/
    // digital-wallets — third_party_token instead of Finix.js's `token`,
    // and merchant_identity set to the Application Owner Identity (not this
    // church's Finix Merchant ID) since WGC hosts every giving page on its
    // own domain. walletToken is read once here and never assigned to any
    // variable that gets logged or persisted.
    const instrument = isWallet
      ? await finixClient.createPaymentInstrument({
          identity: identityId,
          type: paymentMethod === "apple_pay" ? "APPLE_PAY" : "GOOGLE_PAY",
          third_party_token: walletToken,
          merchant_identity: process.env.FINIX_APPLICATION_OWNER_ID,
          name: walletBillingContact.name,
          address: walletBillingContact.address,
        })
      : await finixClient.createPaymentInstrument({ identity: identityId, token, type: "TOKEN" });
    const instrumentId = instrument?.id;
    if (!instrumentId) throw new Error("Failed to create payment instrument");

    const donorRecord = await prisma.donor.upsert({
      where: { finixIdentityId: identityId },
      create: { churchId: church.id, finixIdentityId: identityId, name: fullName, email: donor.email, phone: donor.phone || null },
      update: { name: fullName, email: donor.email, phone: donor.phone || undefined },
    });

    try {
      await syncPaymentInstrument(instrumentId, { churchId: church.id, donorId: donorRecord.id });
    } catch (err) {
      console.error("Failed to snapshot payment instrument for giving-link donation:", err);
    }

    const tags = {
      source: "wgc_giving_link",
      merchantId: church.finixMerchantId,
      churchId: church.id,
      givingLinkId: link.id,
      ...(link.fundName ? { fundId: link.fundName } : {}),
    };

    if (isRecurring) {
      const subscription = await finixClient.createSubscription({
        amount: totalCents,
        currency: "USD",
        billing_interval: interval,
        linked_to: church.finixMerchantId,
        linked_type: "MERCHANT",
        buyer_details: { identity_id: identityId, instrument_id: instrumentId },
        tags,
      });

      await prisma.finixSubscription.upsert({
        where: { finixSubscriptionId: subscription.id },
        create: {
          finixSubscriptionId: subscription.id,
          churchId: church.id,
          givingLinkId: link.id,
          finixMerchantId: church.finixMerchantId,
          finixBuyerIdentityId: identityId,
          finixPaymentInstrumentId: instrumentId,
          state: subscription.state ?? "ACTIVE",
          amountCents: totalCents,
          currency: "USD",
          billingInterval: interval,
          collectionMethod: "BILL_AUTOMATICALLY",
          nextBillingDate: parseFinixDate(subscription.next_billing_date),
          startedAt: new Date(),
          lastSyncedAt: new Date(),
        },
        update: {
          state: subscription.state ?? undefined,
          nextBillingDate: parseFinixDate(subscription.next_billing_date) ?? undefined,
          lastSyncedAt: new Date(),
        },
      });

      await sendReceiptEmail(donor.email, fullName, church.name, totalCents, true, interval);

      await prisma.givingLink.update({
        where: { id: link.id },
        data: { totalAttempts: { increment: 1 }, lastUsedAt: new Date() },
      });

      return NextResponse.json({ success: true, subscriptionId: subscription.id, recurring: true });
    }

    const transfer = await finixClient.createTransfer({
      merchant: church.finixMerchantId,
      amount: totalCents,
      currency: "USD",
      source: instrumentId,
      fraud_session_id: fraudSessionId,
      statement_descriptor: (link.statementDescriptor || church.name).slice(0, 18).toUpperCase(),
      tags,
      ...(feeCoveredCents > 0 ? { supplemental_fee: feeCoveredCents } : {}),
    });

    await prisma.finixTransfer.upsert({
      where: { finixTransferId: transfer.id },
      create: {
        finixTransferId: transfer.id,
        churchId: church.id,
        finixMerchantId: church.finixMerchantId,
        finixPaymentInstrumentId: instrumentId,
        type: transfer.type ?? "DEBIT",
        state: transfer.state ?? "PENDING",
        amountCents: totalCents,
        currency: "USD",
        source: "wgc_giving_link",
        tagsJson: tags,
        createdAtFinix: new Date(),
        lastSyncedAt: new Date(),
      },
      update: { state: transfer.state ?? undefined, lastSyncedAt: new Date() },
    });

    await prisma.payment.create({
      data: {
        churchId: church.id,
        donorId: donorRecord.id,
        givingLinkId: link.id,
        finixTransferId: transfer.id,
        finixBuyerIdentityId: identityId,
        finixPaymentInstrumentId: instrumentId,
        amountCents: totalCents,
        donationAmountCents,
        feeCoveredCents,
        paymentMethodType:
          paymentMethod === "apple_pay"
            ? "APPLE_PAY"
            : paymentMethod === "google_pay"
              ? "GOOGLE_PAY"
              : method === "card"
                ? "PAYMENT_CARD"
                : "BANK_ACCOUNT",
        status: transfer.state ?? "PENDING",
        fundName: link.fundName || null,
        isAnonymous: fieldSettings.anonymousDonation !== "HIDDEN" ? Boolean(donor.isAnonymous) : false,
        note: fieldSettings.donorNote !== "HIDDEN" ? donor.note?.trim() || null : null,
      },
    });

    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";

    const linkUpdateData: Record<string, unknown> = {
      totalAttempts: { increment: 1 },
      lastUsedAt: new Date(),
    };
    if (succeeded) {
      linkUpdateData.successfulDonations = { increment: 1 };
      linkUpdateData.totalCollectedCents = { increment: totalCents };
    } else if (claimedOneTimeLinkId) {
      // Failed attempts must not consume a one-time link — release the claim.
      linkUpdateData.status = "ACTIVE";
    }
    await prisma.givingLink.update({ where: { id: link.id }, data: linkUpdateData });

    const receiptSettings = link.receiptSettingsJson as { sendAutomatically?: boolean } | null;
    if (succeeded && (receiptSettings?.sendAutomatically ?? true)) {
      await sendReceiptEmail(donor.email, fullName, church.name, totalCents, false);
    }

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      state: transfer.state,
      donationAmountCents,
      feeCoveredCents,
      totalCents,
      donorName: fullName,
      churchName: church.name,
      fundName: link.fundName,
      last4: undefined,
    });
  } catch (error: any) {
    // Any failure after a one-time link was claimed must release it so the
    // link stays usable — only a real successful donation should consume it.
    if (claimedOneTimeLinkId) {
      await prisma.givingLink.updateMany({
        where: { id: claimedOneTimeLinkId, status: "INACTIVE" },
        data: { status: "ACTIVE" },
      }).catch(() => {});
    }

    console.error("Giving link donation failed:", error);
    const finixError = error?.details?._embedded?.errors?.[0];
    return NextResponse.json(
      { error: finixError?.failure_message || finixError?.message || "We couldn't process your gift. Please try again." },
      { status: 402 }
    );
  }
}
