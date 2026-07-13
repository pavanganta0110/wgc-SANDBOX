import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { calculateFeeCoveredTotal } from "@/lib/giving/feeCalculator";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { normalizeUSPhone, isValidEmail } from "@/lib/validation";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { validateGoodsServicesInput, computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";
import { logDashboardAction } from "@/lib/dashboardAudit";

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
        return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
      }
      donor.phone = normalized;
    }

    const church = await prisma.church.findUnique({ where: { id: session.churchId } });
    if (!church || !church.finixMerchantId) {
      return NextResponse.json({ error: "Organization is not set up to accept payments" }, { status: 400 });
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

    const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
    const method: "card" | "bank" = paymentMethod === "bank" ? "bank" : "card";

    const { totalCents } = coverFees
      ? calculateFeeCoveredTotal(donationAmountCents, method, {
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        })
      : { totalCents: donationAmountCents };
    const feeCoveredCents = totalCents - donationAmountCents;

    const idempotencyId = existing?.idempotencyId ?? crypto.randomUUID();

    const attempt = existing
      ? await prisma.paymentAttempt.update({
          where: { id: existing.id },
          data: { status: "PROCESSING", updatedAt: new Date() },
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
    if (!identityId) throw new Error("Failed to create buyer identity");

    const instrument = await finixClient.createPaymentInstrument({
      identity: identityId,
      token,
      type: "TOKEN",
    });
    const instrumentId = instrument?.id;
    if (!instrumentId) throw new Error("Failed to create payment instrument");

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

    const transfer = await finixClient.createTransfer({
      merchant: church.finixMerchantId,
      amount: totalCents,
      currency: "USD",
      source: instrumentId,
      fraud_session_id: fraudSessionId,
      idempotency_id: idempotencyId,
      statement_descriptor: church.name.slice(0, 18).toUpperCase(),
      tags: {
        source: "wgc_admin_payment",
        merchantId: church.finixMerchantId,
        churchId: church.id,
        adminUserId: session.userId,
        ...(fundName ? { fundName } : {}),
      },
      ...(feeCoveredCents > 0 ? { supplemental_fee: feeCoveredCents } : {}),
    });

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
        tagsJson: {
          source: "wgc_admin_payment",
          merchantId: church.finixMerchantId,
          churchId: church.id,
          adminUserId: session.userId,
        },
        createdAtFinix: new Date(),
        lastSyncedAt: new Date(),
      },
      update: {
        state: transfer.state ?? undefined,
        lastSyncedAt: new Date(),
      },
    });

    // Quid-pro-quo disclosure for this specific contribution (e.g. a gala
    // ticket or event with a fair-market value) — entered by the admin
    // taking the payment via the "Goods or Services" section of the form.
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
        goodsServicesDescription: goodsServicesProvidedValue ? String(goodsServicesDescription).trim() : null,
        goodsServicesFairMarketValueCents: goodsServicesFairMarketValueCentsValue,
        goodsServicesInternalNote: typeof goodsServicesInternalNote === "string" ? goodsServicesInternalNote.trim() || null : null,
        recordedContributionAmountCents,
        acknowledgmentConfiguredByUserId: session.userId,
        acknowledgmentConfiguredAt: new Date(),
      },
    });

    await logDashboardAction({
      churchId: church.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "giving.goods_services_acknowledgment_set",
      entityType: "payment",
      entityId: newPayment.id,
      metadata: {
        goodsServicesProvided: goodsServicesProvidedValue,
        goodsServicesDescription: goodsServicesProvidedValue ? goodsServicesDescription : null,
        goodsServicesFairMarketValueCents: goodsServicesFairMarketValueCentsValue,
        recordedContributionAmountCents,
      },
      req,
    });

    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";
    if (succeeded) {
      try {
        await sendDonationReceipt(newPayment.id, church.id, session.userId);
      } catch (err) {
        console.error("Failed to send donation receipt:", err);
      }
    }

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      state: transfer.state,
    });
  } catch (error: any) {
    console.error("Take a Payment failed:", error);
    return toSafeErrorResponse(error, 402, {
      userId: session.userId,
      organizationId: session.churchId,
      route: `/api/merchant/transactions/payments/take-payment`,
      action: "TAKE_PAYMENT",
    });
  }
}
