import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { calculateInvoiceBalance } from "./invoiceMoney";
import { computeDerivedInvoiceStatus, type InvoiceStatus } from "./invoiceStatus";

/**
 * Applies a Finix transfer's current state onto its matching InvoicePayment
 * and recomputes the invoice balance/status — the single place this
 * happens, shared by the webhook handler (src/app/api/webhooks/finix/route.ts)
 * and reconcileInvoicePaymentAttempt below (used when a payer returns from
 * a wallet flow and the webhook hasn't arrived yet). Whichever caller gets
 * there first wins; the other's update becomes a no-op once
 * InvoicePayment.status already matches, so a webhook arriving at the same
 * moment as a return-page verification can never double-apply a payment or
 * create a duplicate InvoiceActivity/receipt email.
 */
export async function applyInvoicePaymentTransferState(finixTransferId: string, rawState: string | null | undefined): Promise<{ status: string; applied: boolean }> {
  const priorInvoicePayment = await prisma.invoicePayment.findFirst({ where: { finixTransferId } });
  const newState = (rawState || "PENDING").toUpperCase();
  const newStatus = newState === "SUCCEEDED" ? "SUCCEEDED" : newState === "FAILED" || newState === "CANCELED" ? "FAILED" : "PENDING";

  if (!priorInvoicePayment) return { status: newStatus, applied: false };
  if (priorInvoicePayment.status === newStatus) return { status: newStatus, applied: false };

  // Out-of-order protection: a terminal state already recorded must never
  // be regressed by a stale PENDING re-check.
  const TERMINAL = new Set(["SUCCEEDED", "FAILED"]);
  if (TERMINAL.has(priorInvoicePayment.status) && !TERMINAL.has(newStatus)) {
    return { status: priorInvoicePayment.status, applied: false };
  }

  await prisma.invoicePayment.update({ where: { id: priorInvoicePayment.id }, data: { status: newStatus } });

  const invoice = await prisma.invoice.findUnique({ where: { id: priorInvoicePayment.invoiceId } });
  if (invoice) {
    const payments = await prisma.invoicePayment.findMany({
      where: { invoiceId: invoice.id, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
    });
    const balance = calculateInvoiceBalance({ totalCents: invoice.totalCents, payments });
    const derivedStatus = computeDerivedInvoiceStatus({
      currentStatus: invoice.status as InvoiceStatus,
      balanceCents: balance.balanceCents,
      totalCents: invoice.totalCents,
      hasBeenViewed: Boolean(invoice.firstViewedAt),
      dueDate: invoice.dueDate,
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidCents: balance.amountPaidCents,
        balanceCents: balance.balanceCents,
        status: derivedStatus,
        paidAt: derivedStatus === "PAID" && !invoice.paidAt ? new Date() : invoice.paidAt,
      },
    });
    await prisma.invoiceActivity.create({
      data: {
        invoiceId: invoice.id,
        churchId: invoice.churchId,
        activityType: newStatus === "SUCCEEDED" ? "invoice.payment_settled" : "invoice.payment_failed",
        metadata: { finixTransferId, previousStatus: priorInvoicePayment.status, newStatus },
      },
    });

    // Invoice-feature usage ledger — trusted server-side only (this
    // function is the single choke point both the Finix webhook and the
    // payer-return reconciliation path go through; never driven by a raw
    // browser signal). Idempotent per finixTransferId + resulting status,
    // so a duplicate webhook, a page refresh, or a reconciliation retry
    // can never double-count.
    if (derivedStatus === "PAID" || derivedStatus === "PARTIALLY_PAID") {
      try {
        const { recordInvoiceUsageEvent } = await import("@/lib/billing/invoiceUsageLedger");
        await recordInvoiceUsageEvent({
          organizationId: invoice.churchId,
          invoiceId: invoice.id,
          invoicePaymentId: priorInvoicePayment.id,
          eventType: derivedStatus === "PAID" ? "INVOICE_PAID" : "INVOICE_PARTIALLY_PAID",
          invoiceAmountCents: invoice.totalCents,
          amountPaidCents: balance.amountPaidCents,
          idempotencyKey: `${finixTransferId}:${derivedStatus}`,
        });
      } catch (err) {
        console.error("Invoice usage ledger recording failed (non-fatal):", err);
      }
    }

    if (newStatus === "SUCCEEDED" && priorInvoicePayment.method === "ACH") {
      try {
        const { sendInvoicePaymentReceiptEmail } = await import("./invoiceEmails");
        await sendInvoicePaymentReceiptEmail(invoice.id, priorInvoicePayment.id);
      } catch (err) {
        console.error("Failed to send invoice ACH settlement receipt email:", err);
      }
    }
  }

  return { status: newStatus, applied: true };
}

/**
 * Called from the public payment-status endpoint when a payer returns to
 * the invoice page (e.g. after a wallet flow) — verifies the real payment
 * state directly against Finix rather than trusting any client-side or URL
 * signal, per "reconcile the invoice when the customer returns, even if
 * the webhook has not arrived yet." A no-op (just returns current state)
 * once the attempt has already reached a terminal state.
 */
export async function reconcileInvoicePaymentAttempt(clientAttemptId: string) {
  const attempt = await prisma.invoicePaymentAttempt.findUnique({ where: { clientAttemptId } });
  if (!attempt) return null;

  if ((attempt.status === "PROCESSING" || attempt.status === "PENDING") && attempt.finixTransferId) {
    try {
      const remote = await finixClient.getTransfer(attempt.finixTransferId);
      const remoteState = (remote.state || "PENDING").toUpperCase();
      const attemptStatus = remoteState === "SUCCEEDED" ? "SUCCEEDED" : remoteState === "FAILED" || remoteState === "CANCELED" ? "FAILED" : "PENDING";
      if (attemptStatus !== attempt.status) {
        await prisma.invoicePaymentAttempt.update({ where: { id: attempt.id }, data: { status: attemptStatus } });
      }
      await applyInvoicePaymentTransferState(attempt.finixTransferId, remote.state);
    } catch (err) {
      console.error("Failed to reconcile invoice payment attempt against Finix:", err);
    }
  }

  const [refreshedAttempt, payment] = await Promise.all([
    prisma.invoicePaymentAttempt.findUnique({ where: { id: attempt.id } }),
    attempt.finixTransferId ? prisma.invoicePayment.findFirst({ where: { finixTransferId: attempt.finixTransferId } }) : null,
  ]);

  return { attempt: refreshedAttempt, payment };
}
