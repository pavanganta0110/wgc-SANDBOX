import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { checkInvoiceViewRateLimit } from "@/lib/invoices/invoicePublicRateLimit";
import { reconcileInvoicePaymentAttempt } from "@/lib/invoices/invoicePaymentReconciliation";

/**
 * Public, unauthenticated — the payer's client polls this after a wallet
 * (Apple Pay / Google Pay) flow completes, and whenever a payment attempt
 * comes back PENDING (ACH), instead of trusting the wallet sheet's own
 * "success" callback or any URL parameter. Actively re-verifies against
 * Finix (see reconcileInvoicePaymentAttempt) rather than only reading
 * whatever's currently in the database, so the invoice reconciles even if
 * the webhook hasn't arrived yet.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const clientAttemptId = url.searchParams.get("attemptId");

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkInvoiceViewRateLimit(`status:${ip}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }
  if (!clientAttemptId) {
    return NextResponse.json({ error: "Missing attempt ID." }, { status: 400 });
  }

  const resolved = await resolveInvoicePublicToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "This invoice link is invalid." }, { status: 404 });
  }

  const result = await reconcileInvoicePaymentAttempt(clientAttemptId);
  if (!result?.attempt || result.attempt.invoiceId !== resolved.invoiceId) {
    // No enumeration oracle — an attempt ID that doesn't belong to this
    // invoice's token is reported identically to one that doesn't exist.
    return NextResponse.json({ error: "Payment attempt not found." }, { status: 404 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: resolved.invoiceId }, select: { invoiceNumber: true, status: true, balanceCents: true } });

  return NextResponse.json({
    state: result.attempt.status,
    transferId: result.attempt.finixTransferId,
    method: result.attempt.method,
    amountCents: result.payment?.grossAmountCents ?? null,
    feeContributionCents: result.payment?.feeContributionCents ?? null,
    totalCents: result.payment?.totalChargedCents ?? result.attempt.amountCents,
    customerCoveredFee: result.payment?.customerCoveredFee ?? null,
    paidAt: result.payment?.status === "SUCCEEDED" ? result.payment.updatedAt : null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceStatus: invoice?.status ?? null,
    balanceCents: invoice?.balanceCents ?? null,
    failureCode: result.attempt.failureCode,
    failureMessage: result.attempt.failureMessage,
  });
}
