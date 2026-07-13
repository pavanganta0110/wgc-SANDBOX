import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { calculateFeeCoveredTotal } from "@/lib/giving/feeCalculator";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { sendReceiptEmail } from "@/lib/giving/sendReceiptEmail";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { normalizeUSPhone, isValidEmail } from "@/lib/validation";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

const isDev = process.env.NODE_ENV === "development";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const body = await req.json();
    const {
      token,
      donationAmountCents,
      coverFees,
      isRecurring,
      billingInterval,
      paymentMethod,
      fraudSessionId,
      donor,
    } = body;

    if (!token || !donationAmountCents || donationAmountCents < 100) {
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

    if (isDev) {
      console.log("[give] Donor from form →", { name: donor.name, email: donor.email, phone: donor.phone });
    }

    const givingPage = await prisma.givingPage.findUnique({ where: { slug } });
    if (!givingPage || !givingPage.enabled) {
      return NextResponse.json({ error: "This giving page is not accepting gifts" }, { status: 404 });
    }

    const church = await prisma.church.findUnique({ where: { id: givingPage.churchId } });
    if (!church || !church.finixMerchantId) {
      return NextResponse.json({ error: "This organization cannot accept gifts right now" }, { status: 400 });
    }

    const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
    const method: "card" | "bank" = paymentMethod === "bank" ? "bank" : "card";

    // Server is the source of truth for the charged amount — never trust a
    // client-supplied total, only the base donation amount and whether they
    // opted to cover fees.
    const { totalCents } = coverFees
      ? calculateFeeCoveredTotal(donationAmountCents, method, {
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        })
      : { totalCents: donationAmountCents };
    const feeCoveredCents = totalCents - donationAmountCents;

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
    const identityId = identity?.id;
    if (!identityId) {
      throw new Error("Failed to create buyer identity");
    }

    const instrument = await finixClient.createPaymentInstrument({
      identity: identityId,
      token,
      type: "TOKEN",
    });
    const instrumentId = instrument?.id;
    if (!instrumentId) {
      throw new Error("Failed to create payment instrument");
    }

    const donorRecord = await prisma.donor.upsert({
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

    if (isDev) {
      console.log("[give] Donor saved to DB →", { id: donorRecord.id, name: donorRecord.name, email: donorRecord.email, phone: donorRecord.phone });
    }

    // The dashboard's Donor columns everywhere (Payments, Recurring Donors,
    // detail panels) join through FinixPaymentInstrumentSnapshot, not
    // straight off the identity — without this the gift shows up but the
    // donor name never does. donorId is passed directly since we already
    // resolved it above.
    try {
      await syncPaymentInstrument(instrumentId, { churchId: church.id, donorId: donorRecord.id });
    } catch (err) {
      console.error("Failed to snapshot payment instrument for giving-page donation:", err);
    }

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
        tags: { source: "wgc_giving_page", merchantId: church.finixMerchantId, churchId: church.id, givingPageId: givingPage.id },
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

    const transfer = await finixClient.createTransfer({
      merchant: church.finixMerchantId,
      amount: totalCents,
      currency: "USD",
      source: instrumentId,
      fraud_session_id: fraudSessionId,
      statement_descriptor: church.name.slice(0, 18).toUpperCase(),
      tags: { source: "wgc_giving_page", merchantId: church.finixMerchantId, churchId: church.id, givingPageId: givingPage.id },
      // Per docs.finix.com/guides/platform-payments/monetizing-payments/calculating-fees-dynamically:
      // supplemental_fee is additive reporting on top of amount (amount alone
      // is what's charged to the donor's card — this doesn't change that).
      // Only sent when WGC computed the covered-fee portion itself.
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
        source: "wgc_giving_page",
        tagsJson: { source: "wgc_giving_page", merchantId: church.finixMerchantId, churchId: church.id, givingPageId: givingPage.id },
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
        paymentMethodType: method === "card" ? "PAYMENT_CARD" : "BANK_ACCOUNT",
        status: transfer.state ?? "PENDING",
      },
    });

    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";
    if (succeeded) {
      try {
        await sendDonationReceipt(newPayment.id, church.id);
      } catch (err) {
        console.error("Failed to send donation receipt:", err);
      }
    }

    return NextResponse.json({ success: true, transferId: transfer.id, state: transfer.state });
  } catch (error: any) {
    console.error("Giving page donation failed:", error);
    return toSafeErrorResponse(error, 402, {
      route: `/api/give/[slug]`,
      action: "DONATE_LEGACY",
    });
  }
}
