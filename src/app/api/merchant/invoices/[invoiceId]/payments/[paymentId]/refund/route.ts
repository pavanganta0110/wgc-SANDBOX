import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { redactFinixPayload } from "@/lib/finix/redact";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { calculateInvoiceBalance } from "@/lib/invoices/invoiceMoney";
import { computeDerivedInvoiceStatus, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

/**
 * Refunds a single InvoicePayment — for a FINIX-sourced payment this calls
 * Finix's own reversal API (the existing refund system used elsewhere in
 * this app, see /transactions/payments/[transferId]/refund/route.ts —
 * reused here rather than duplicated). For an OFFLINE-sourced payment
 * there is no processor to call; this is purely a bookkeeping adjustment
 * the merchant is asserting is true (they returned cash, voided a check,
 * etc.), recorded the same way.
 *
 * Either way, only refundedCents/status on the InvoicePayment are ever
 * touched — never grossAmountCents/netAmountCents — and the invoice
 * balance/status is always recomputed from the full payments ledger, never
 * decremented in place.
 */
export async function POST(req: Request, { params }: { params: Promise<{ invoiceId: string; paymentId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canRefundInvoicePayments");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { invoiceId, paymentId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const payment = await prisma.invoicePayment.findFirst({ where: { id: paymentId, invoiceId, churchId: auth.churchId } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }
  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
    return NextResponse.json({ error: "This payment is not eligible for a refund." }, { status: 400 });
  }

  const refundableCents = payment.grossAmountCents - payment.refundedCents;
  const body = await req.json().catch(() => ({}));
  const requestedCents = typeof body?.amountCents === "number" ? Math.round(body.amountCents) : refundableCents;
  if (requestedCents <= 0 || requestedCents > refundableCents) {
    return NextResponse.json({ error: "The refund amount cannot exceed the remaining refundable balance." }, { status: 400 });
  }

  if (payment.source === "FINIX") {
    if (!payment.finixTransferId) {
      return toSafeErrorResponse("This payment could not be matched to a processor transfer.", 400);
    }
    try {
      const reversal = await finixClient.createTransferReversal(payment.finixTransferId, {
        refund_amount: requestedCents,
        tags: { source: "wgc_invoice_refund", churchId: auth.churchId, invoiceId, invoicePaymentId: payment.id },
      });
      await prisma.finixRefundOrReversal.upsert({
        where: { finixReversalId: reversal.id },
        create: {
          finixReversalId: reversal.id,
          churchId: auth.churchId,
          finixOriginalTransferId: payment.finixTransferId,
          amountCents: reversal.amount ?? requestedCents,
          currency: reversal.currency ?? invoice.currency,
          state: reversal.state ?? "PENDING",
          type: reversal.type ?? "REVERSAL",
          subtype: reversal.subtype ?? null,
          source: "wgc_invoice_refund",
          rawJsonRedacted: redactFinixPayload(reversal),
          createdAtFinix: reversal.created_at ? new Date(reversal.created_at) : new Date(),
          lastSyncedAt: new Date(),
        },
        update: { state: reversal.state ?? undefined, rawJsonRedacted: redactFinixPayload(reversal), lastSyncedAt: new Date() },
      });
    } catch (err) {
      return toSafeErrorResponse(err, 502, { action: "refundInvoicePayment", resourceId: payment.id });
    }
    // The webhook's reconcileInvoicePaymentReversal() will apply
    // refundedCents/status once Finix confirms the reversal — this route
    // doesn't apply it optimistically, so a declined reversal never leaves
    // the invoice's balance wrong.
    return NextResponse.json({ success: true, pending: true });
  }

  // OFFLINE: no processor round-trip — apply immediately.
  const now = new Date();
  const newRefundedCents = payment.refundedCents + requestedCents;
  const newPaymentStatus = newRefundedCents >= payment.grossAmountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";

  const result = await prisma.$transaction(async (tx) => {
    await tx.invoicePayment.update({
      where: { id: payment.id },
      data: { refundedCents: newRefundedCents, status: newPaymentStatus },
    });

    const payments = await tx.invoicePayment.findMany({
      where: { invoiceId: invoice.id, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
    });
    // The in-memory list above hasn't picked up the update just made in
    // this same transaction — patch it in explicitly rather than re-query,
    // since calculateInvoiceBalance needs the post-refund refundedCents.
    const patchedPayments = payments.map((p) => (p.id === payment.id ? { ...p, refundedCents: newRefundedCents, status: newPaymentStatus } : p));
    const balance = calculateInvoiceBalance({ totalCents: invoice.totalCents, payments: patchedPayments });
    const derivedStatus = computeDerivedInvoiceStatus({
      currentStatus: invoice.status as InvoiceStatus,
      balanceCents: balance.balanceCents,
      totalCents: invoice.totalCents,
      hasBeenViewed: Boolean(invoice.firstViewedAt),
      dueDate: invoice.dueDate,
      now,
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidCents: balance.amountPaidCents,
        refundedCents: balance.refundedCents,
        balanceCents: balance.balanceCents,
        status: derivedStatus,
      },
    });

    await tx.invoiceActivity.create({
      data: {
        invoiceId: invoice.id,
        churchId: invoice.churchId,
        activityType: "invoice.offline_payment_refunded",
        actorUserId: auth.userId,
        actorEmail: auth.email,
        metadata: { paymentId: payment.id, amountCents: requestedCents },
      },
    });

    return { balanceCents: balance.balanceCents, status: derivedStatus };
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.offline_payment_refunded",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: { paymentId: payment.id, amountCents: requestedCents },
    req,
  });

  const { recordInvoiceUsageEvent } = await import("@/lib/billing/invoiceUsageLedger");
  await recordInvoiceUsageEvent({
    organizationId: auth.churchId,
    invoiceId,
    invoicePaymentId: payment.id,
    eventType: newPaymentStatus === "REFUNDED" ? "INVOICE_REFUNDED" : "INVOICE_PARTIALLY_PAID",
    amountPaidCents: requestedCents,
    // Idempotent per refund-amount-application, not per route call — a
    // retried request with the same resulting refundedCents never
    // double-counts, but two genuinely separate partial refunds each get
    // their own key.
    idempotencyKey: `${payment.id}:REFUND:${newRefundedCents}`,
  }).catch((err) => console.error("Invoice usage ledger recording failed (non-fatal):", err));

  return NextResponse.json({ success: true, ...result });
}
