import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import {
  calculateFeeCoveredTotal,
  isDynamicSupplementalFeesEnabled,
  calculateDynamicSupplementalFee,
  normalizeCardBrand,
  checkPricingWarning,
  FEE_CALCULATION_VERSION,
} from "@/lib/giving/feeCalculator";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { sendReceiptEmail } from "@/lib/giving/sendReceiptEmail";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { normalizeUSPhone, isValidEmail } from "@/lib/validation";
import { isGivingLinkUsable } from "@/lib/givingLinks/status";
import { parseDonorFieldSettings, parseAllowedPaymentMethods, parseAllowedFrequencies } from "@/lib/givingLinks/types";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import crypto from "crypto";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let claimedOneTimeLinkId: string | null = null;

  try {
    const body = await req.json();
    const {
      token,
      paymentInstrumentId,
      walletToken,
      walletBillingContact,
      donationAmountCents,
      coverFees,
      isRecurring,
      billingInterval,
      paymentMethod,
      fraudSessionId,
      donor,
      preview = false,
      expectedTotalCents,
      clientAttemptId,
    } = body;

    const isWallet = paymentMethod === "apple_pay" || paymentMethod === "google_pay";

    if (!donationAmountCents || donationAmountCents < 100) {
      return NextResponse.json({ error: "Invalid donation amount" }, { status: 400 });
    }
    if (isWallet ? !walletToken : (!token && !paymentInstrumentId)) {
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

    const dynamicFeesEnabled = isDynamicSupplementalFeesEnabled(church.finixMerchantId);

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

    // 1. Resolve Identity and Payment Instrument
    let identityId: string;
    let instrumentId: string;
    let cardBrand: string | null = null;
    let donorRecord: any;

    if (paymentInstrumentId) {
      instrumentId = paymentInstrumentId;
      const instrument = await finixClient.getPaymentInstrument(instrumentId);
      if (!instrument?.id) {
        return NextResponse.json({ error: "Payment method not found on Finix" }, { status: 404 });
      }
      identityId = instrument.identity;
      cardBrand = instrument.card?.brand || null;

      const existingDonor = await prisma.donor.findFirst({
        where: { finixIdentityId: identityId, churchId: church.id },
      });
      if (existingDonor) {
        donorRecord = existingDonor;
      } else {
        const [firstName, ...rest] = fullName.trim().split(" ");
        const lastName = rest.join(" ") || firstName;
        donorRecord = await prisma.donor.upsert({
          where: { finixIdentityId: identityId },
          create: { churchId: church.id, finixIdentityId: identityId, name: fullName, email: donor.email, phone: donor.phone || null },
          update: { name: fullName, email: donor.email, phone: donor.phone || undefined },
        });
      }
    } else {
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
      identityId = identity?.id;
      if (!identityId) throw new Error("Failed to create buyer identity");

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
      instrumentId = instrument?.id;
      if (!instrumentId) throw new Error("Failed to create payment instrument");

      cardBrand = instrument.card?.brand || null;

      donorRecord = await prisma.donor.upsert({
        where: { finixIdentityId: identityId },
        create: { churchId: church.id, finixIdentityId: identityId, name: fullName, email: donor.email, phone: donor.phone || null },
        update: { name: fullName, email: donor.email, phone: donor.phone || undefined },
      });

      try {
        await syncPaymentInstrument(instrumentId, { churchId: church.id, donorId: donorRecord.id });
      } catch (err) {
        console.error("Failed to snapshot payment instrument for giving-link donation:", err);
      }
    }

    // 2. Perform Fee Calculation
    let totalCents: number;
    let feeCoveredCents: number;
    let feeRes: any = null;

    if (dynamicFeesEnabled) {
      const brand = normalizeCardBrand(cardBrand);
      feeRes = calculateDynamicSupplementalFee({
        donationAmountCents,
        paymentMethod: paymentMethod === "bank" ? "ACH" : "CARD",
        cardBrand: brand,
        donorCoversFee: link.feeCoverEnabled && coverFees,
      });
      totalCents = feeRes.donorChargeAmountCents;
      feeCoveredCents = feeRes.supplementalFeeCents;
    } else {
      const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
      const oldFee = link.feeCoverEnabled && coverFees
        ? calculateFeeCoveredTotal(donationAmountCents, method, {
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          })
        : { totalCents: donationAmountCents };
      totalCents = oldFee.totalCents;
      feeCoveredCents = totalCents - donationAmountCents;
    }

    // 3. Return Preview Response if requested
    if (dynamicFeesEnabled && preview) {
      return NextResponse.json({
        preview: true,
        paymentInstrumentId: instrumentId,
        cardBrand: feeRes.normalizedCardBrand,
        donationAmountCents,
        processingFeeCents: feeRes.processingFeeCents,
        donorChargeAmountCents: feeRes.donorChargeAmountCents,
        supplementalFeeCents: feeRes.supplementalFeeCents,
        merchantExpectedNetCents: feeRes.merchantExpectedNetCents,
      });
    }

    // 4. Verify expected total matches recalculated server total
    if (dynamicFeesEnabled && typeof expectedTotalCents === "number" && expectedTotalCents !== totalCents) {
      return NextResponse.json({ error: "Payment amount has changed. Please confirm and try again." }, { status: 400 });
    }

    // 5. Check Idempotency
    const idempotencyId = clientAttemptId || crypto.randomUUID();
    const existingTransfer = await finixClient.findTransferByIdempotencyId(idempotencyId);
    if (existingTransfer) {
      const existingPayment = await prisma.payment.findFirst({
        where: { finixTransferId: existingTransfer.id },
      });
      if (existingPayment) {
        return NextResponse.json({
          success: true,
          transferId: existingTransfer.id,
          state: existingTransfer.state,
          duplicate: true,
        });
      }
    }

    // One-time link claim (after preview check passes, before charging)
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

    const tags: any = {
      source: "wgc_giving_link",
      merchantId: church.finixMerchantId,
      churchId: church.id,
      givingLinkId: link.id,
    };

    if (dynamicFeesEnabled) {
      tags.donation_amount_cents = String(donationAmountCents);
      tags.processing_fee_cents = String(feeRes.processingFeeCents);
      tags.donor_covers_fee = String(link.feeCoverEnabled && coverFees);
      tags.fee_strategy = (link.feeCoverEnabled && coverFees) ? "DONOR_PAID" : "ORGANIZATION_PAID";
      tags.card_brand = feeRes.normalizedCardBrand || "NONE";
      tags.fee_percentage_bps = String(feeRes.percentageBps);
      tags.fee_fixed_cents = String(feeRes.fixedFeeCents);
      tags.fee_calculation_version = FEE_CALCULATION_VERSION;
    }

    // 6. Handle Subscription flow
    if (isRecurring) {
      const subscription = await finixClient.createSubscription({
        amount: totalCents,
        currency: "USD",
        billing_interval: interval as any,
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
          donationAmountCents,
          donorCoversFee: link.feeCoverEnabled && coverFees,
          feeCalculationVersion: dynamicFeesEnabled ? "v1" : null,
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

    // 7. Handle Transfer flow
    const transferPayload: any = {
      merchant: church.finixMerchantId,
      amount: totalCents,
      currency: "USD",
      source: instrumentId,
      fraud_session_id: fraudSessionId,
      idempotency_id: idempotencyId,
      statement_descriptor: (link.statementDescriptor || church.name).slice(0, 18).toUpperCase(),
      tags,
    };

    if ((link.feeCoverEnabled && coverFees) && feeCoveredCents > 0) {
      transferPayload.supplemental_fee = feeCoveredCents;
    }

    const transfer = await finixClient.createTransfer(transferPayload);

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

    const newPayment = await prisma.payment.create({
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
        donorCoversFee: link.feeCoverEnabled && coverFees,
        cardBrand: dynamicFeesEnabled ? feeRes.normalizedCardBrand : null,
        percentageBps: dynamicFeesEnabled ? feeRes.percentageBps : null,
        fixedFeeCents: dynamicFeesEnabled ? feeRes.fixedFeeCents : null,
        feeCalculationVersion: dynamicFeesEnabled ? FEE_CALCULATION_VERSION : null,
        merchantExpectedNetCents: dynamicFeesEnabled ? feeRes.merchantExpectedNetCents : (totalCents - feeCoveredCents),
        fundName: link.fundName || null,
        isAnonymous: fieldSettings.anonymousDonation !== "HIDDEN" ? Boolean(donor.isAnonymous) : false,
        note: fieldSettings.donorNote !== "HIDDEN" ? donor.note?.trim() || null : null,
      },
    });

    if (dynamicFeesEnabled) {
      await checkPricingWarning(church.id, church.finixMerchantId);
    }

    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";

    const linkUpdateData: Record<string, unknown> = {
      totalAttempts: { increment: 1 },
      lastUsedAt: new Date(),
    };
    if (succeeded) {
      linkUpdateData.successfulDonations = { increment: 1 };
      linkUpdateData.totalCollectedCents = { increment: totalCents };
    } else if (claimedOneTimeLinkId) {
      linkUpdateData.status = "ACTIVE";
    }
    await prisma.givingLink.update({ where: { id: link.id }, data: linkUpdateData });

    const receiptSettings = link.receiptSettingsJson as { sendAutomatically?: boolean } | null;
    if (succeeded && (receiptSettings?.sendAutomatically ?? true)) {
      try {
        await sendDonationReceipt(newPayment.id, church.id);
      } catch (err) {
        console.error("Failed to send donation receipt:", err);
      }
    }

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      state: transfer.state,
      donationAmountCents,
      feeCoveredCents,
      totalCents,
    });
  } catch (error: any) {
    console.error("Giving Link donation failed:", error);
    if (claimedOneTimeLinkId) {
      try {
        await prisma.givingLink.update({
          where: { id: claimedOneTimeLinkId },
          data: { status: "ACTIVE" },
        });
      } catch (releaseErr) {
        console.error("Failed to release one-time giving link claim:", releaseErr);
      }
    }
    return toSafeErrorResponse(error, 402, {
      route: `/api/g/[slug]/donate`,
      action: "DONATE_LINK_LEGACY",
    });
  }
}
