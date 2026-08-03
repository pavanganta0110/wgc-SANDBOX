import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { canAcceptPayment, computeDerivedInvoiceStatus, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";
import { calculateInvoiceBalance } from "@/lib/invoices/invoiceMoney";

const OFFLINE_METHODS = ["CASH", "CHECK", "BANK_TRANSFER", "CASH_APP", "EXTERNAL_TERMINAL", "OTHER"] as const;

/**
 * Records a payment collected outside Finix (cash, check, bank transfer,
 * Cash App, an external terminal, or another method) against an invoice's
 * balance. Never touches Finix — this is purely a bookkeeping entry the
 * merchant is asserting is true, distinct from an InvoicePayment created by
 * the public payment page's Finix flow (source: "OFFLINE" vs "FINIX").
 */
export async function POST(req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canRecordOfflineInvoicePayments");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (!canAcceptPayment(invoice.status as InvoiceStatus)) {
    return NextResponse.json({ error: "This invoice cannot accept a payment in its current state." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const amountCents = Math.round(Number(body?.amountCents));
  const method = typeof body?.method === "string" ? body.method.toUpperCase() : "";
  const offlinePaymentDate = body?.offlinePaymentDate ? new Date(body.offlinePaymentDate) : new Date();
  const offlineReferenceNumber = typeof body?.offlineReferenceNumber === "string" ? body.offlineReferenceNumber.trim() || null : null;
  const offlineNotes = typeof body?.offlineNotes === "string" ? body.offlineNotes.trim() || null : null;

  if (!Number.isInteger(amountCents) || amountCents < 1) {
    return NextResponse.json({ error: "Please enter a valid payment amount." }, { status: 400 });
  }
  if (!(OFFLINE_METHODS as readonly string[]).includes(method)) {
    return NextResponse.json({ error: "Please select a valid payment method." }, { status: 400 });
  }
  if (Number.isNaN(offlinePaymentDate.getTime())) {
    return NextResponse.json({ error: "Please enter a valid payment date." }, { status: 400 });
  }

  // Server-recomputed balance, same "never trust a client-submitted amount
  // against a stale balance, block don't credit" rule as the public Finix
  // payment route — an offline entry can still overpay the invoice on paper
  // if two team members record the same payment, so this check matters here
  // too, not just for card/bank charges.
  const existingPayments = await prisma.invoicePayment.findMany({
    where: { invoiceId: invoice.id, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
  });
  const balance = calculateInvoiceBalance({ totalCents: invoice.totalCents, payments: existingPayments });
  if (amountCents > balance.balanceCents) {
    return NextResponse.json({ error: `The amount cannot exceed the remaining balance of $${(balance.balanceCents / 100).toFixed(2)}.` }, { status: 400 });
  }

  const now = new Date();
  const newAmountPaidCents = balance.amountPaidCents + amountCents;
  const newBalanceCents = Math.max(0, invoice.totalCents - newAmountPaidCents);
  const derivedStatus = computeDerivedInvoiceStatus({
    currentStatus: invoice.status as InvoiceStatus,
    balanceCents: newBalanceCents,
    totalCents: invoice.totalCents,
    hasBeenViewed: Boolean(invoice.firstViewedAt),
    dueDate: invoice.dueDate,
    now,
  });

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        churchId: invoice.churchId,
        source: "OFFLINE",
        method,
        grossAmountCents: amountCents,
        processingFeeCents: 0,
        netAmountCents: amountCents,
        status: "SUCCEEDED",
        offlinePaymentDate,
        offlineReferenceNumber,
        offlineNotes,
        recordedByUserId: auth.userId,
        recordedByEmail: auth.email,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidCents: newAmountPaidCents,
        balanceCents: newBalanceCents,
        status: derivedStatus,
        paidAt: derivedStatus === "PAID" ? now : invoice.paidAt,
      },
    });

    await tx.invoiceActivity.create({
      data: {
        invoiceId: invoice.id,
        churchId: invoice.churchId,
        activityType: "invoice.offline_payment_recorded",
        actorUserId: auth.userId,
        actorEmail: auth.email,
        metadata: { amountCents, method, offlineReferenceNumber },
      },
    });

    return created;
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.offline_payment_recorded",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: { paymentId: payment.id, amountCents, method },
    req,
  });

  return NextResponse.json({ success: true, payment: { id: payment.id }, status: derivedStatus, balanceCents: newBalanceCents });
}
