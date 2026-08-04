import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { resolveInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { checkInvoicePaymentRateLimit } from "@/lib/invoices/invoicePublicRateLimit";
import { calculateInvoiceBalance } from "@/lib/invoices/invoiceMoney";
import { computeDerivedInvoiceStatus, canAcceptPayment, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";
import { calculateCharitablePortionForPayment } from "@/lib/invoices/invoiceClassification";
import { FEE_CALCULATION_VERSION } from "@/lib/giving/feeCalculator";
import { resolveWgcTransferFeeStrategy } from "@/lib/giving/serverFeeStrategy";
import { toSafePaymentErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Public, unauthenticated invoice payment submission — the payer is never
 * required to have an account. Deliberately does NOT create or touch a
 * Donor record (invoice Clients are a separate identity, never
 * auto-merged into Donor — see docs/invoicing.md). Mirrors
 * take-payment/route.ts's identity -> instrument -> fee-strategy -> transfer
 * flow, adapted for a single unified instrument-creation path that handles
 * card/bank tokens and Apple/Google Pay wallet tokens identically (see
 * /api/g/[slug]/donate/route.ts, which established this same unification).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkInvoicePaymentRateLimit(`pay:${ip}`)) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Too many requests. Please try again shortly.", reference: null, retryable: true }, { status: 429 });
  }

  const resolved = await resolveInvoicePublicToken(token);
  if (!resolved) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "This invoice link is invalid.", reference: null, retryable: false }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Invalid request.", reference: null, retryable: false }, { status: 400 });
  }

  const {
    amountCents,
    paymentMethod, // "card" | "bank" | "apple_pay" | "google_pay"
    finixToken, // card/bank Finix.js token
    walletToken,
    walletBillingContact,
    fraudSessionId,
    clientAttemptId,
    payer,
    coverFee, // payer's fee-coverage checkbox selection — advisory only, re-gated below
    expectedTotalCents, // what the client's UI displayed as the total — validated, never trusted as authoritative
  } = body;

  const method: "card" | "bank" | "apple_pay" | "google_pay" =
    paymentMethod === "bank" || paymentMethod === "apple_pay" || paymentMethod === "google_pay" ? paymentMethod : "card";
  const isWallet = method === "apple_pay" || method === "google_pay";

  if (!clientAttemptId || typeof clientAttemptId !== "string") {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Missing client attempt ID.", reference: null, retryable: false }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Invalid payment amount (minimum $1.00).", reference: null, retryable: false }, { status: 400 });
  }
  if (isWallet ? !walletToken : !finixToken) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Missing payment details.", reference: null, retryable: false }, { status: 400 });
  }
  if (!payer?.name || !payer?.email) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Name and email are required.", reference: null, retryable: false }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: resolved.invoiceId } });
  if (!invoice || invoice.churchId !== resolved.churchId) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "This invoice link is invalid.", reference: null, retryable: false }, { status: 404 });
  }

  const status = invoice.status as InvoiceStatus;
  if (!canAcceptPayment(status)) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "This invoice can no longer accept payment.", reference: null, retryable: false }, { status: 409 });
  }
  if (invoice.paymentDeadline && new Date() > invoice.paymentDeadline) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "The payment deadline for this invoice has passed.", reference: null, retryable: false }, { status: 409 });
  }

  if (method === "card" && !invoice.allowCard) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Card payment is not enabled for this invoice.", reference: null, retryable: false }, { status: 400 });
  }
  if (method === "bank" && !invoice.allowAch) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Bank payment is not enabled for this invoice.", reference: null, retryable: false }, { status: 400 });
  }
  if (method === "apple_pay" && !invoice.allowApplePay) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Apple Pay is not enabled for this invoice.", reference: null, retryable: false }, { status: 400 });
  }
  if (method === "google_pay" && !invoice.allowGooglePay) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Google Pay is not enabled for this invoice.", reference: null, retryable: false }, { status: 400 });
  }
  if (!isWallet && method === "card" && !fraudSessionId) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Missing fraud session.", reference: null, retryable: false }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: invoice.churchId } });
  if (!church || !church.finixMerchantId) {
    return NextResponse.json({ success: false, code: "PAYMENT_CONFIGURATION_ERROR", message: "This organization is not currently set up to accept payments.", reference: null, retryable: false }, { status: 400 });
  }

  // Server-side balance recheck immediately before any Finix call — never
  // trust a client-submitted amount. Recomputed fresh from the live
  // payments ledger, not from the (possibly stale) invoice.balanceCents
  // column, so a just-completed payment on another tab can't be missed.
  const existingPayments = await prisma.invoicePayment.findMany({
    where: { invoiceId: invoice.id, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
  });
  const balance = calculateInvoiceBalance({ totalCents: invoice.totalCents, payments: existingPayments });
  if (balance.balanceCents <= 0) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "This invoice has already been paid in full.", reference: null, retryable: false }, { status: 409 });
  }
  if (amountCents > balance.balanceCents) {
    // Block, don't credit — never allow an overpayment to be silently
    // capped and charged anyway.
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: `The payment amount cannot exceed the remaining balance of $${(balance.balanceCents / 100).toFixed(2)}.`, reference: null, retryable: false }, { status: 400 });
  }
  if (amountCents < balance.balanceCents) {
    if (!invoice.allowPartialPayments) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Partial payments are not allowed on this invoice. Please pay the full balance.", reference: null, retryable: false }, { status: 400 });
    }
    if (invoice.minimumPartialPaymentCents && amountCents < invoice.minimumPartialPaymentCents) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: `The minimum partial payment is $${(invoice.minimumPartialPaymentCents / 100).toFixed(2)}.`, reference: null, retryable: false }, { status: 400 });
    }
  }

  // Idempotency — mirrors PaymentAttempt's clientAttemptId pattern exactly.
  // A duplicate submit (double-click, refresh, retry after a timeout) never
  // creates a second Finix transfer.
  const existingAttempt = await prisma.invoicePaymentAttempt.findUnique({ where: { clientAttemptId } });
  if (existingAttempt && (existingAttempt.status === "SUCCEEDED" || existingAttempt.status === "PROCESSING" || existingAttempt.status === "PENDING")) {
    // A refresh, double-click, or returning wallet flow for an attempt
    // already in flight/settled — never re-charges. Re-fetches the linked
    // InvoicePayment (if the transaction that creates it has already
    // committed) so a page reload gets the same rich success/processing
    // details as the original request, not just a bare "duplicate" flag.
    const existingPayment = existingAttempt.finixTransferId
      ? await prisma.invoicePayment.findFirst({ where: { finixTransferId: existingAttempt.finixTransferId } })
      : null;
    return NextResponse.json({
      success: true,
      duplicate: true,
      transferId: existingAttempt.finixTransferId,
      state: existingAttempt.status,
      amountCents: existingPayment?.grossAmountCents ?? undefined,
      feeContributionCents: existingPayment?.feeContributionCents ?? undefined,
      totalCents: existingPayment?.totalChargedCents ?? existingAttempt.amountCents,
      customerCoveredFee: existingPayment?.customerCoveredFee ?? undefined,
      method: existingAttempt.method,
      invoiceNumber: invoice.invoiceNumber,
    });
  }

  const [firstName, ...rest] = String(payer.name).trim().split(" ");
  const lastName = rest.join(" ") || firstName;

  let identity;
  try {
    identity = await finixClient.createBuyerIdentity({
      entity: { first_name: firstName, last_name: lastName, email: payer.email, phone: payer.phone || undefined },
    });
  } catch (err) {
    return toSafePaymentErrorResponse(err, "PAYMENT_FAILED", "Could not verify identity with processor. No charge was made.", true, { action: "createBuyerIdentity" });
  }
  const identityId = identity?.id;
  if (!identityId) {
    return toSafePaymentErrorResponse(new Error("Failed to create buyer identity"), "PAYMENT_FAILED", "Could not process identity. No charge was made.", true, { action: "createBuyerIdentity" });
  }

  let instrumentPayload: Record<string, unknown>;
  if (isWallet) {
    // merchant_identity must equal the identity the wallet token was
    // tokenized against client-side (FINIX_APPLICATION_OWNER_ID) — the
    // church's own Finix identity is rejected by Finix here, per the
    // precedent documented in /api/g/[slug]/donate/route.ts.
    instrumentPayload = {
      identity: identityId,
      merchant_identity: process.env.FINIX_APPLICATION_OWNER_ID,
      type: method === "google_pay" ? "GOOGLE_PAY" : "APPLE_PAY",
      third_party_token: walletToken,
      name: walletBillingContact?.name,
      address: {
        line1: walletBillingContact?.address?.line1,
        line2: walletBillingContact?.address?.line2,
        city: walletBillingContact?.address?.city,
        region: walletBillingContact?.address?.region,
        postal_code: walletBillingContact?.address?.postal_code,
        country: walletBillingContact?.address?.country,
      },
    };
  } else {
    instrumentPayload = { identity: identityId, token: finixToken, type: "TOKEN" };
  }

  let instrument;
  try {
    instrument = await finixClient.createPaymentInstrument(instrumentPayload);
  } catch (err) {
    return toSafePaymentErrorResponse(err, "PAYMENT_FAILED", "Could not verify payment instrument with processor. No charge was made.", true, { action: "createPaymentInstrument" });
  }
  const instrumentId = instrument?.id;
  if (!instrumentId) {
    return toSafePaymentErrorResponse(new Error("Failed to create payment instrument"), "PAYMENT_FAILED", "Could not process payment instrument. No charge was made.", true, { action: "createPaymentInstrument" });
  }

  // The payer's checkbox selection is only ever advisory — if the merchant
  // has turned fee coverage off for this invoice (allowFeeCoverage: false),
  // it's ignored entirely and the payer is charged exactly the invoice
  // amount, no matter what the client submits. Uses the same
  // calculateWgcFeeAmounts gross-up formula as every other payment surface
  // in this codebase (donations, subscriptions) — never a second,
  // invoice-specific fee calculation.
  const effectiveCoverFee = invoice.allowFeeCoverage && Boolean(coverFee);

  let feeStrategy;
  try {
    feeStrategy = resolveWgcTransferFeeStrategy({
      donationAmountCents: amountCents,
      paymentMethod: method === "bank" ? "ACH" : "CARD",
      cardBrand: instrument.card?.brand,
      donorCoversFee: effectiveCoverFee,
    });
  } catch (err) {
    return toSafePaymentErrorResponse(err, "PAYMENT_CONFIGURATION_ERROR", "Pricing configuration error for this organization.", true, { action: "resolveFeeStrategy" });
  }

  const totalCents = feeStrategy.amountToChargeCents;
  const feeContributionCents = effectiveCoverFee ? feeStrategy.supplementalFeeCents : 0;

  // The frontend's displayed total is only an estimate (it can't know the
  // exact card-brand rate before tokenization) — but if a client submits
  // one at all, it must match what the server just computed within a
  // one-cent rounding tolerance, or the charge is rejected outright rather
  // than silently charging a different amount than what the payer saw on
  // screen.
  if (typeof expectedTotalCents === "number" && Math.abs(expectedTotalCents - totalCents) > 1) {
    return NextResponse.json(
      {
        success: false,
        code: "VALIDATION_ERROR",
        message: "The payment total has changed. Please review the updated amount and try again.",
        reference: null,
        retryable: true,
        totalCents,
      },
      { status: 409 }
    );
  }
  const idempotencyId = existingAttempt?.idempotencyKey ?? crypto.randomUUID();
  const finixMethod: "CARD" | "ACH" | "APPLE_PAY" | "GOOGLE_PAY" = method === "bank" ? "ACH" : method === "apple_pay" ? "APPLE_PAY" : method === "google_pay" ? "GOOGLE_PAY" : "CARD";

  const attempt = existingAttempt
    ? await prisma.invoicePaymentAttempt.update({
        where: { id: existingAttempt.id },
        data: { status: "PROCESSING", updatedAt: new Date(), amountCents: totalCents },
      })
    : await prisma.invoicePaymentAttempt.create({
        data: {
          invoiceId: invoice.id,
          churchId: invoice.churchId,
          clientAttemptId,
          idempotencyKey: idempotencyId,
          amountCents: totalCents,
          method: finixMethod,
          status: "PROCESSING",
          payerName: payer.name,
          payerEmail: payer.email,
          payerPhone: payer.phone || null,
        },
      });

  const transferPayload: Record<string, unknown> = {
    merchant: church.finixMerchantId,
    amount: totalCents,
    currency: "USD",
    source: instrumentId,
    fee_profile: feeStrategy.feeProfileId,
    ...(method === "card" && { fraud_session_id: fraudSessionId }),
    idempotency_id: idempotencyId,
    statement_descriptor: church.name.slice(0, 18).toUpperCase(),
    tags: {
      source: "wgc_invoice_payment",
      merchantId: church.finixMerchantId,
      churchId: church.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      donation_amount_cents: String(amountCents),
      processing_fee_cents: String(feeStrategy.expectedFeeCents),
      fee_strategy: feeStrategy.feePaidBy,
      fee_calculation_version: FEE_CALCULATION_VERSION,
    },
  };
  if (feeStrategy.feePaidBy === "DONOR" && feeStrategy.supplementalFeeCents > 0) {
    transferPayload.supplemental_fee = feeStrategy.supplementalFeeCents;
  }

  let transfer;
  try {
    transfer = await finixClient.createTransfer(transferPayload);
  } catch (err) {
    await prisma.invoicePaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "FAILED", failureCode: "TRANSFER_FAILED", failureMessage: "Processor declined the transfer." },
    });
    return toSafePaymentErrorResponse(err, "PAYMENT_FAILED", "We couldn't complete your payment. No charge was made.", true, { action: "createTransfer" });
  }

  // Snapshots the card/bank display info (last four, brand) onto
  // FinixPaymentInstrumentSnapshot so this transfer shows correctly in the
  // merchant's Transactions > Payments list — that list joins through this
  // table for its "Payment Instrument"/"Instrument Type" columns.
  // skipDonorMatch is required, not optional: invoice payers are
  // deliberately never turned into Donor records (see the module doc
  // comment above) — without it, syncPaymentInstrument's own fallback
  // would upsert a Donor from the payer's identity whenever churchId is
  // present, which would then let this transfer leak into that donor's
  // year-end statement via the instrument/transfer scan in
  // yearEndStatements.ts, bypassing computeInvoicePaymentLines' own
  // CHARITABLE_DONATION/PARTIAL_DONATION classification gate entirely —
  // including for GOODS_OR_SERVICES invoices that were never a donation.
  try {
    const { syncPaymentInstrument } = await import("@/lib/finix/sync/syncPaymentInstruments");
    await syncPaymentInstrument(instrumentId, { churchId: invoice.churchId, skipDonorMatch: true });
  } catch (err) {
    console.error("Failed to snapshot payment instrument for invoice payment:", err);
  }

  const transferState = (transfer.state || "PENDING").toUpperCase();
  const succeeded = transferState === "SUCCEEDED";
  const paymentStatus = succeeded ? "SUCCEEDED" : transferState === "FAILED" || transferState === "CANCELED" ? "FAILED" : "PENDING";

  const now = new Date();
  const derivedStatus = paymentStatus === "SUCCEEDED"
    ? computeDerivedInvoiceStatus({
        currentStatus: status,
        balanceCents: Math.max(0, invoice.totalCents - (balance.amountPaidCents + amountCents)),
        totalCents: invoice.totalCents,
        hasBeenViewed: true,
        dueDate: invoice.dueDate,
        now,
      })
    : status;

  let createdPaymentId: string | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.invoicePaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: paymentStatus, finixTransferId: transfer.id },
    });

    const createdPayment = await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        churchId: invoice.churchId,
        source: "FINIX",
        method: finixMethod,
        grossAmountCents: amountCents,
        processingFeeCents: feeStrategy.expectedFeeCents,
        netAmountCents: totalCents - feeStrategy.expectedFeeCents,
        feeContributionCents,
        totalChargedCents: totalCents,
        customerCoveredFee: effectiveCoverFee,
        status: paymentStatus,
        finixTransferId: transfer.id,
        invoicePaymentAttemptId: attempt.id,
      },
    });
    createdPaymentId = createdPayment.id;

    if (paymentStatus === "SUCCEEDED") {
      const newAmountPaidCents = balance.amountPaidCents + amountCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaidCents: newAmountPaidCents,
          balanceCents: Math.max(0, invoice.totalCents - newAmountPaidCents),
          status: derivedStatus,
          paidAt: derivedStatus === "PAID" ? now : invoice.paidAt,
        },
      });

      await tx.invoiceActivity.create({
        data: {
          invoiceId: invoice.id,
          churchId: invoice.churchId,
          activityType: "invoice.payment_received",
          metadata: {
            amountCents,
            method: finixMethod,
            finixTransferId: transfer.id,
            payerName: payer.name,
            payerEmail: payer.email,
            charitablePortionCents: calculateCharitablePortionForPayment({
              classification: invoice.classification as "GOODS_OR_SERVICES" | "CHARITABLE_DONATION" | "PARTIAL_DONATION",
              totalCents: invoice.totalCents,
              charitablePortionCents: invoice.charitablePortionCents,
              paymentGrossCents: amountCents,
            }),
          },
        },
      });
    }

    await tx.finixTransfer.upsert({
      where: { finixTransferId: transfer.id },
      create: {
        finixTransferId: transfer.id,
        churchId: invoice.churchId,
        finixMerchantId: church.finixMerchantId,
        finixPaymentInstrumentId: instrumentId,
        finixBuyerIdentityId: identityId,
        type: transfer.type ?? "DEBIT",
        state: transfer.state ?? "PENDING",
        amountCents: totalCents,
        currency: "USD",
        source: "wgc_invoice_payment",
        tagsJson: transferPayload.tags as object,
        createdAtFinix: new Date(),
        lastSyncedAt: new Date(),
      },
      update: { state: transfer.state ?? undefined, lastSyncedAt: new Date() },
    });
  });

  if (paymentStatus === "SUCCEEDED") {
    await logDashboardAction({
      churchId: invoice.churchId,
      action: "invoice.payment_received",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { amountCents, method: finixMethod, finixTransferId: transfer.id, payerEmail: payer.email },
    });
    if (createdPaymentId) {
      const { sendInvoicePaymentReceiptEmail } = await import("@/lib/invoices/invoiceEmails");
      await sendInvoicePaymentReceiptEmail(invoice.id, createdPaymentId);
    }
  }

  return NextResponse.json({
    success: true,
    transferId: transfer.id,
    state: paymentStatus,
    amountCents,
    feeContributionCents,
    totalCents,
    customerCoveredFee: effectiveCoverFee,
    method: finixMethod,
    paidAt: paymentStatus === "SUCCEEDED" ? now.toISOString() : null,
    invoiceNumber: invoice.invoiceNumber,
    status: derivedStatus,
  });
}
