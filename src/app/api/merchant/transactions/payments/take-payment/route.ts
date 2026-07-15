import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { FEE_CALCULATION_VERSION } from "@/lib/giving/feeCalculator";
import { resolveWgcTransferFeeStrategy } from "@/lib/giving/serverFeeStrategy";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { normalizeUSPhone, isValidEmail } from "@/lib/validation";
import { toSafeErrorResponse, toSafePaymentErrorResponse } from "@/lib/utils/errorNormalizer";
import { validateGoodsServicesInput, computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";
import { logDashboardAction } from "@/lib/dashboardAudit";
import crypto from "crypto";

export async function POST(req: Request) {
  const session = await getSession();

  if (!session || session.role !== "church_admin" || !session.churchId) {
    return toSafeErrorResponse("You do not have permission to perform this action.", 401);
  }

  try {
    const body = await req.json();
    const {
      token,
      donationAmountCents,
      coverFees,
      paymentMethod,
      fraudSessionId,
      clientAttemptId,
      donor,
      fundName,
      note,
      isAnonymous,
      goodsServicesProvided,
      goodsServicesDescription,
      goodsServicesFairMarketValueCents,
      goodsServicesInternalNote,
    } = body;

    if (!token || !donationAmountCents || donationAmountCents < 100) {
      return NextResponse.json({ error: "Invalid payment amount (minimum $1.00)" }, { status: 400 });
    }

    const goodsServicesValidation = validateGoodsServicesInput(
      {
        provided: Boolean(goodsServicesProvided),
        description: typeof goodsServicesDescription === "string" ? goodsServicesDescription : "",
        fairMarketValueCents: typeof goodsServicesFairMarketValueCents === "number" ? goodsServicesFairMarketValueCents : null,
      },
      donationAmountCents,
    );
    if (!goodsServicesValidation.valid) {
      return NextResponse.json({ error: "Please correct the goods/services information", fieldErrors: goodsServicesValidation.errors }, { status: 400 });
    }
    if (!fraudSessionId) {
      return NextResponse.json({ error: "Missing fraud session" }, { status: 400 });
    }
    if (!clientAttemptId) {
      return NextResponse.json({ error: "Missing client attempt ID" }, { status: 400 });
    }
    if (!donor?.name || !donor?.email) {
      return NextResponse.json({ error: "Donor name and email are required" }, { status: 400 });
    }
    if (!isValidEmail(donor.email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (donor.phone) {
      const normalized = normalizeUSPhone(donor.phone);
      if (!normalized) {
        return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Please enter a valid U.S. phone number", retryable: true }, { status: 400 });
      }
      donor.phone = normalized;
    }

    const church = await prisma.church.findUnique({ where: { id: session.churchId } });
    if (!church || !church.finixMerchantId) {
      return NextResponse.json({ success: false, code: "PAYMENT_CONFIGURATION_ERROR", message: "Organization is not set up to accept payments", retryable: false }, { status: 400 });
    }


    const existing = await prisma.paymentAttempt.findUnique({ where: { clientAttemptId } });
    if (existing) {
      if (existing.status === "SUCCEEDED" || existing.status === "PENDING") {
        return NextResponse.json({
          success: true,
          transferId: existing.finixTransferId,
          state: existing.status,
          duplicate: true,
        });
      }
    }

    const method: "card" | "bank" = paymentMethod === "bank" ? "bank" : "card";

    // Create identity first
    const [firstName, ...rest] = String(donor.name).trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    let identity;
    try {
      identity = await finixClient.createBuyerIdentity({
        entity: {
          first_name: firstName,
          last_name: lastName,
          email: donor.email,
          phone: donor.phone || undefined,
        },
      });
    } catch (err) {
      return toSafePaymentErrorResponse(err, "PAYMENT_FAILED", "Could not verify identity with processor. No charge was made.", true, { action: "createBuyerIdentity" });
    }
    const identityId = identity?.id;
    if (!identityId) {
      return toSafePaymentErrorResponse(new Error("Failed to create buyer identity"), "PAYMENT_FAILED", "Could not process identity. No charge was made.", true, { action: "createBuyerIdentity" });
    }

    let instrument;
    try {
      instrument = await finixClient.createPaymentInstrument({
        identity: identityId,
        token,
        type: "TOKEN",
      });
    } catch (err) {
      return toSafePaymentErrorResponse(err, "PAYMENT_FAILED", "Could not verify payment instrument with processor. No charge was made.", true, { action: "createPaymentInstrument" });
    }
    const instrumentId = instrument?.id;
    if (!instrumentId) {
      return toSafePaymentErrorResponse(new Error("Failed to create payment instrument"), "PAYMENT_FAILED", "Could not process payment instrument. No charge was made.", true, { action: "createPaymentInstrument" });
    }

    // Perform Fee Calculation
    let feeStrategy;
    try {
      feeStrategy = resolveWgcTransferFeeStrategy({
        donationAmountCents,
        paymentMethod: method === "bank" ? "ACH" : "CARD",
        cardBrand: instrument.card?.brand,
        donorCoversFee: coverFees,
      });
    } catch (err) {
      return toSafePaymentErrorResponse(err, "PAYMENT_CONFIGURATION_ERROR", "Pricing configuration error for this organization.", true, { action: "resolveFeeStrategy" });
    }
    
    const totalCents = feeStrategy.amountToChargeCents;
    const feeCoveredCents = feeStrategy.supplementalFeeCents;

    const idempotencyId = existing?.idempotencyId ?? crypto.randomUUID();

    const attempt = existing
      ? await prisma.paymentAttempt.update({
          where: { id: existing.id },
          data: { status: "PROCESSING", updatedAt: new Date(), feeCents: feeCoveredCents, totalCents },
        })
      : await prisma.paymentAttempt.create({
          data: {
            churchId: church.id,
            adminUserId: session.userId,
            clientAttemptId,
            idempotencyId,
            amountCents: donationAmountCents,
            feeCents: feeCoveredCents,
            totalCents,
            paymentMethodType: method === "card" ? "PAYMENT_CARD" : "BANK_ACCOUNT",
            fundName: fundName || null,
            note: note || null,
            isAnonymous: isAnonymous ?? false,
            fraudSessionId,
            status: "PROCESSING",
          },
        });

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

    try {
      await syncPaymentInstrument(instrumentId, { churchId: church.id, donorId: donorRecord.id });
    } catch (err) {
      console.error("Failed to snapshot payment instrument for admin payment:", err);
    }

    const transferPayload: any = {
      merchant: church.finixMerchantId,
      amount: totalCents,
      currency: "USD",
      source: instrumentId,
      fee_profile: feeStrategy.feeProfileId,
      ...(method !== "bank" && { fraud_session_id: fraudSessionId }),
      idempotency_id: idempotencyId,
      statement_descriptor: church.name.slice(0, 18).toUpperCase(),
      tags: {
        source: "wgc_admin_payment",
        merchantId: church.finixMerchantId,
        churchId: church.id,
        adminUserId: session.userId,
        donation_amount_cents: String(donationAmountCents),
        processing_fee_cents: String(feeStrategy.expectedFeeCents),
        donor_covers_fee: String(coverFees),
        fee_strategy: feeStrategy.feePaidBy,
        card_brand: feeStrategy.normalizedCardBrand || "NONE",
        fee_percentage_bps: String(feeStrategy.percentageBasisPoints),
        fee_fixed_cents: String(feeStrategy.fixedFeeCents),
        fee_calculation_version: FEE_CALCULATION_VERSION,
        ...(fundName ? { fundName } : {}),
      },
    };

    if (feeStrategy.feePaidBy === "DONOR" && feeStrategy.supplementalFeeCents > 0) {
      transferPayload.supplemental_fee = feeStrategy.supplementalFeeCents;
    }

    let transfer;
    try {
      transfer = await finixClient.createTransfer(transferPayload);
    } catch (err) {
      return toSafePaymentErrorResponse(err, "PAYMENT_FAILED", "We couldn’t complete your donation. No charge was made.", true, { action: "createTransfer" });
    }

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: (transfer.state || "PENDING").toUpperCase(),
        finixTransferId: transfer.id,
        donorId: donorRecord.id,
      },
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
        source: "wgc_admin_payment",
        tagsJson: transferPayload.tags,
        createdAtFinix: new Date(),
        lastSyncedAt: new Date(),
      },
      update: {
        state: transfer.state ?? undefined,
        lastSyncedAt: new Date(),
      },
    });

    const goodsServicesProvidedValue = Boolean(goodsServicesProvided);
    const goodsServicesFairMarketValueCentsValue = goodsServicesProvidedValue ? goodsServicesFairMarketValueCents ?? 0 : null;
    const recordedContributionAmountCents = goodsServicesProvidedValue
      ? computeRecordedContributionAmountCents(donationAmountCents, goodsServicesFairMarketValueCentsValue ?? 0)
      : donationAmountCents;

    const newPayment = await prisma.payment.create({
      data: {
        churchId: church.id,
        donorId: donorRecord.id,
        finixTransferId: transfer.id,
        finixBuyerIdentityId: identityId,
        finixPaymentInstrumentId: instrumentId,
        amountCents: totalCents,
        donationAmountCents,
        feeCoveredCents,
        paymentMethodType: method === "card" ? "PAYMENT_CARD" : "BANK_ACCOUNT",
        status: transfer.state ?? "PENDING",
        idempotencyId,
        fraudSessionId,
        fundName: fundName || null,
        note: note || null,
        isAnonymous: isAnonymous ?? false,
        createdByAdminUserId: session.userId,
        paymentAttemptId: attempt.id,
        goodsServicesProvided: goodsServicesProvidedValue,
        goodsServicesDescription: goodsServicesProvidedValue ? goodsServicesDescription : null,
        goodsServicesFairMarketValueCents: goodsServicesFairMarketValueCentsValue,
        goodsServicesInternalNote: goodsServicesProvidedValue ? goodsServicesInternalNote : null,
        recordedContributionAmountCents,
        donorCoversFee: coverFees,
        cardBrand: feeStrategy.normalizedCardBrand,
        percentageBps: feeStrategy.percentageBasisPoints,
        fixedFeeCents: feeStrategy.fixedFeeCents,
        feeCalculationVersion: FEE_CALCULATION_VERSION,
        merchantExpectedNetCents: totalCents - feeStrategy.expectedFeeCents,
      },
    });

    await logDashboardAction({
      churchId: church.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "TAKE_PAYMENT",
      entityType: "PAYMENT",
      entityId: newPayment.id,
      metadata: {
        donorId: donorRecord.id,
        amountCents: totalCents,
        feeCents: feeCoveredCents,
        fundName,
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
    console.error("Admin take-payment failed:", error);
    return toSafeErrorResponse(error, 402, {
      route: `/api/merchant/transactions/payments/take-payment`,
      action: "TAKE_PAYMENT",
    });
  }
}
