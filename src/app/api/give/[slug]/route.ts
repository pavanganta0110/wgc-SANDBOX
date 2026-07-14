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
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import crypto from "crypto";

const isDev = process.env.NODE_ENV === "development";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const body = await req.json();
    const {
      token,
      paymentInstrumentId,
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
      selectedPersonId,
    } = body;

    if (!token && !paymentInstrumentId) {
      return NextResponse.json({ error: "Invalid payment details" }, { status: 400 });
    }
    if (!donationAmountCents || donationAmountCents < 100) {
      return NextResponse.json({ error: "Invalid donation amount" }, { status: 400 });
    }
    if (!fraudSessionId) {
      return NextResponse.json({ error: "Missing fraud session" }, { status: 400 });
    }
    if (!donor?.name || !donor?.email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }
    if (!isValidEmail(donor.email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (donor.phone) {
      const normalized = normalizeUSPhone(donor.phone);
      if (!normalized) {
        return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
      }
      donor.phone = normalized;
    }

    const givingPage = await prisma.givingPage.findUnique({
      where: { slug },
      include: { givingPagePersons: true }
    });
    if (!givingPage || !givingPage.enabled) {
      return NextResponse.json({ error: "This giving page is not accepting gifts" }, { status: 404 });
    }

    let personSnapshot: { id: string; name: string; title: string | null } | null = null;
    let designationType = "ORGANIZATION";

    if (givingPage.givingPageType === "PERSON") {
      if (givingPage.givingPagePersons.length === 1) {
        // Auto-resolve if only 1 person
        const person = await prisma.organizationPerson.findUnique({
          where: { id: givingPage.givingPagePersons[0].personId }
        });
        if (person && person.isActive) {
          personSnapshot = { id: person.id, name: person.displayName, title: person.title };
          designationType = "PERSON";
        } else {
          return NextResponse.json({ error: "The designated person is no longer active." }, { status: 400 });
        }
      } else {
        if (!selectedPersonId) {
          return NextResponse.json({ error: "Please select a person to support." }, { status: 400 });
        }
        const isValid = givingPage.givingPagePersons.some(p => p.personId === selectedPersonId);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid person selection." }, { status: 400 });
        }
        const person = await prisma.organizationPerson.findUnique({ where: { id: selectedPersonId } });
        if (person && person.isActive) {
          personSnapshot = { id: person.id, name: person.displayName, title: person.title };
          designationType = "PERSON";
        } else {
          return NextResponse.json({ error: "The designated person is no longer active." }, { status: 400 });
        }
      }
    }

    const church = await prisma.church.findUnique({ where: { id: givingPage.churchId } });
    if (!church || !church.finixMerchantId) {
      return NextResponse.json({ error: "This organization cannot accept gifts right now" }, { status: 400 });
    }

    const dynamicFeesEnabled = isDynamicSupplementalFeesEnabled(church.finixMerchantId);

    // 1. Resolve Identity and Payment Instrument
    let identityId: string;
    let instrumentId: string;
    let cardBrand: string | null = null;
    let donorRecord: any;

    if (token) {
      const [firstName, ...rest] = String(donor.name).trim().split(" ");
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
      if (!identityId) {
        throw new Error("Failed to create buyer identity");
      }

      const instrument = await finixClient.createPaymentInstrument({
        identity: identityId,
        token,
        type: "TOKEN",
      });
      instrumentId = instrument?.id;
      if (!instrumentId) {
        throw new Error("Failed to create payment instrument");
      }

      cardBrand = instrument.card?.brand || null;

      donorRecord = await prisma.donor.upsert({
        where: { finixIdentityId: identityId },
        create: {
          churchId: church.id,
          finixIdentityId: identityId,
          name: donor.name,
          email: donor.email,
          phone: donor.phone || null,
        },
        update: {
          name: donor.name,
          email: donor.email,
          phone: donor.phone || undefined,
        },
      });

      try {
        await syncPaymentInstrument(instrumentId, { churchId: church.id, donorId: donorRecord.id });
      } catch (err) {
        console.error("Failed to snapshot payment instrument for giving-page donation:", err);
      }
    } else {
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
        const [firstName, ...rest] = String(donor.name).trim().split(" ");
        const lastName = rest.join(" ") || firstName;
        donorRecord = await prisma.donor.upsert({
          where: { finixIdentityId: identityId },
          create: {
            churchId: church.id,
            finixIdentityId: identityId,
            name: donor.name,
            email: donor.email,
            phone: donor.phone || null,
          },
          update: {
            name: donor.name,
            email: donor.email,
            phone: donor.phone || undefined,
          },
        });
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
        donorCoversFee: coverFees,
      });
      totalCents = feeRes.donorChargeAmountCents;
      feeCoveredCents = feeRes.supplementalFeeCents;
    } else {
      const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
      const method: "card" | "bank" = paymentMethod === "bank" ? "bank" : "card";
      const oldFee = coverFees
        ? calculateFeeCoveredTotal(donationAmountCents, method, {
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          })
        : { totalCents: donationAmountCents };
      totalCents = oldFee.totalCents;
      feeCoveredCents = totalCents - donationAmountCents;
    }

    // 3. Return Preview response if requested
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

    // 4. Verify client total matches recalculated server total
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

    if (isDev) {
      console.log("[give] Donor saved to DB →", { id: donorRecord.id, name: donorRecord.name, email: donorRecord.email, phone: donorRecord.phone });
    }

    // 6. Handle Subscription flow
    if (isRecurring) {
      const interval = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"].includes(billingInterval)
        ? billingInterval
        : "MONTHLY";

      const subscription = await finixClient.createSubscription({
        amount: totalCents,
        currency: "USD",
        billing_interval: interval,
        linked_to: church.finixMerchantId,
        linked_type: "MERCHANT",
        buyer_details: { identity_id: identityId, instrument_id: instrumentId },
        tags: {
          source: "wgc_giving_page",
          merchantId: church.finixMerchantId,
          churchId: church.id,
          givingPageId: givingPage.id,
          ...(personSnapshot && {
            designation_type: "PERSON",
            selected_person_id: personSnapshot.id,
            selected_person_name: personSnapshot.name
          })
        },
      });

      await prisma.finixSubscription.upsert({
        where: { finixSubscriptionId: subscription.id },
        create: {
          finixSubscriptionId: subscription.id,
          churchId: church.id,
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
          donorCoversFee: coverFees,
          feeCalculationVersion: dynamicFeesEnabled ? "v1" : null,
          givingPageType: givingPage.givingPageType,
          designationType,
          selectedPersonId: personSnapshot?.id || null,
          selectedPersonNameSnapshot: personSnapshot?.name || null,
          selectedPersonTitleSnapshot: personSnapshot?.title || null,
          lastSyncedAt: new Date(),
        },
        update: {
          state: subscription.state ?? undefined,
          nextBillingDate: parseFinixDate(subscription.next_billing_date) ?? undefined,
          lastSyncedAt: new Date(),
        },
      });

      await sendReceiptEmail(donor.email, donor.name, church.name, totalCents, true, interval);

      return NextResponse.json({ success: true, subscriptionId: subscription.id });
    }

    // 7. Handle Transfer flow
    const transferPayload: any = {
      merchant: church.finixMerchantId,
      amount: totalCents,
      currency: "USD",
      source: instrumentId,
      fraud_session_id: fraudSessionId,
      idempotency_id: idempotencyId,
      statement_descriptor: church.name.slice(0, 18).toUpperCase(),
      tags: {
        source: "wgc_giving_page",
        merchantId: church.finixMerchantId,
        churchId: church.id,
        givingPageId: givingPage.id,
        ...(personSnapshot && {
          designation_type: "PERSON",
          selected_person_id: personSnapshot.id,
          selected_person_name: personSnapshot.name
        })
      },
    };

    if (dynamicFeesEnabled) {
      transferPayload.tags = {
        ...transferPayload.tags,
        donation_amount_cents: String(donationAmountCents),
        processing_fee_cents: String(feeRes.processingFeeCents),
        donor_covers_fee: String(coverFees),
        fee_strategy: coverFees ? "DONOR_PAID" : "ORGANIZATION_PAID",
        card_brand: feeRes.normalizedCardBrand || "NONE",
        fee_percentage_bps: String(feeRes.percentageBps),
        fee_fixed_cents: String(feeRes.fixedFeeCents),
        fee_calculation_version: FEE_CALCULATION_VERSION,
      };
      if (coverFees && feeCoveredCents > 0) {
        transferPayload.supplemental_fee = feeCoveredCents;
      }
    } else {
      if (coverFees && feeCoveredCents > 0) {
        transferPayload.supplemental_fee = feeCoveredCents;
      }
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
        source: "wgc_giving_page",
        tagsJson: transferPayload.tags,
        createdAtFinix: new Date(),
        lastSyncedAt: new Date(),
      },
      update: {
        state: transfer.state ?? undefined,
        lastSyncedAt: new Date(),
      },
    });

    const newPayment = await prisma.payment.create({
      data: {
        churchId: church.id,
        donorId: donorRecord.id,
        givingPageId: givingPage.id,
        finixTransferId: transfer.id,
        finixBuyerIdentityId: identityId,
        finixPaymentInstrumentId: instrumentId,
        amountCents: totalCents,
        donationAmountCents,
        feeCoveredCents,
        currency: "USD",
        paymentMethodType: paymentMethod === "bank" ? "BANK_ACCOUNT" : "PAYMENT_CARD",
        status: transfer.state ?? "PENDING",
        donorCoversFee: coverFees,
        cardBrand: dynamicFeesEnabled ? feeRes.normalizedCardBrand : null,
        percentageBps: dynamicFeesEnabled ? feeRes.percentageBps : null,
        fixedFeeCents: dynamicFeesEnabled ? feeRes.fixedFeeCents : null,
        feeCalculationVersion: dynamicFeesEnabled ? FEE_CALCULATION_VERSION : null,
        merchantExpectedNetCents: dynamicFeesEnabled ? feeRes.merchantExpectedNetCents : (totalCents - feeCoveredCents),
        givingPageType: givingPage.givingPageType,
        designationType,
        selectedPersonId: personSnapshot?.id || null,
        selectedPersonNameSnapshot: personSnapshot?.name || null,
        selectedPersonTitleSnapshot: personSnapshot?.title || null,
      },
    });

    if (dynamicFeesEnabled) {
      await checkPricingWarning(church.id, church.finixMerchantId);
    }

    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";
    if (succeeded) {
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
    console.error("Giving page donation failed:", error);
    return toSafeErrorResponse(error, 402, {
      route: `/api/give/[slug]`,
      action: "DONATE_LEGACY",
    });
  }
}
