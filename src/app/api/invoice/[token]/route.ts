import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { checkInvoiceViewRateLimit } from "@/lib/invoices/invoicePublicRateLimit";
import { computeDerivedInvoiceStatus, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";
import { resolveInvoiceBranding, applyInvoiceOverrides } from "@/lib/invoices/invoiceBranding";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Public, unauthenticated — resolves an invoice payment token to display
 * data only. Never exposes the invoice's internal database ID, churchId,
 * clientId, createdByUserId, internalNotes, or any other merchant-internal
 * field. A view here (the first one) records firstViewedAt/lastViewedAt and
 * recomputes status to VIEWED, per "Sent becomes viewed when the secure
 * invoice page is opened."
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkInvoiceViewRateLimit(`view:${ip}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const resolved = await resolveInvoicePublicToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "This invoice link is invalid." }, { status: 404 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: resolved.invoiceId } });
  if (!invoice || invoice.churchId !== resolved.churchId) {
    // Defensive — the token's churchId must always match the invoice it
    // resolves to; a mismatch here means data corruption, not a normal
    // "not found," but the public response is identical either way (no
    // enumeration oracle).
    return NextResponse.json({ error: "This invoice link is invalid." }, { status: 404 });
  }

  const now = new Date();
  const isFirstView = !invoice.firstViewedAt;
  const derivedStatus = computeDerivedInvoiceStatus({
    currentStatus: invoice.status as InvoiceStatus,
    balanceCents: invoice.balanceCents,
    totalCents: invoice.totalCents,
    hasBeenViewed: true,
    dueDate: invoice.dueDate,
    now,
  });

  if (isFirstView || derivedStatus !== invoice.status) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { firstViewedAt: invoice.firstViewedAt ?? now, lastViewedAt: now, status: derivedStatus },
    });
    if (isFirstView) {
      await logDashboardAction({ churchId: invoice.churchId, action: "invoice.viewed", entityType: "invoice", entityId: invoice.id });
    }
  } else {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { lastViewedAt: now } });
  }

  const [client, lineItems, payments, church] = await Promise.all([
    prisma.client.findUnique({ where: { id: invoice.clientId }, select: { displayName: true, email: true } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id }, orderBy: { sortOrder: "asc" } }),
    prisma.invoicePayment.findMany({ where: { invoiceId: invoice.id, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, orderBy: { createdAt: "asc" } }),
    prisma.church.findUnique({ where: { id: invoice.churchId }, select: { name: true, finixMerchantId: true } }),
  ]);

  const branding = applyInvoiceOverrides(await resolveInvoiceBranding(invoice.churchId), invoice);

  // finixMerchantId and googlePayGatewayMerchantId are not secrets — the
  // same values already flow to the public /g/[slug] giving page (see
  // loadPublicGivingPageData.ts) and are required client-side for Finix.js
  // tokenization / Google Pay's PaymentDataRequest to work at all.
  const googlePayGatewayMerchantId = process.env.FINIX_APPLICATION_OWNER_ID || null;
  const googlePayMerchantId = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || null;
  const googlePayEnvironment: "TEST" | "PRODUCTION" =
    process.env.NEXT_PUBLIC_FINIX_ENV === "live" && process.env.GOOGLE_PAY_PRODUCTION_APPROVED === "true" ? "PRODUCTION" : "TEST";

  return NextResponse.json({
    invoiceNumber: invoice.invoiceNumber,
    status: derivedStatus,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    title: invoice.title,
    clientName: client?.displayName || "Client",
    lineItems: lineItems.map((li) => {
      const grossCents = li.quantity * li.unitPriceCents;
      const afterDiscountCents = li.totalCents - li.taxAmountCents;
      return {
        description: li.description,
        detailedDescription: li.detailedDescription,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        discountAppliedCents: Math.max(0, grossCents - afterDiscountCents),
        taxAmountCents: li.taxAmountCents,
        totalCents: li.totalCents,
      };
    }),
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    taxCents: invoice.taxCents,
    serviceFeeCents: invoice.serviceFeeCents,
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.amountPaidCents,
    balanceCents: invoice.balanceCents,
    classification: invoice.classification,
    clientMemo: invoice.clientMemo,
    paymentInstructions: invoice.paymentInstructions,
    termsAndConditions: invoice.termsAndConditions,
    allowCard: invoice.allowCard,
    allowAch: invoice.allowAch,
    allowApplePay: invoice.allowApplePay,
    allowGooglePay: invoice.allowGooglePay,
    allowPartialPayments: invoice.allowPartialPayments,
    minimumPartialPaymentCents: invoice.minimumPartialPaymentCents,
    feeCoveredBy: invoice.feeCoveredBy,
    allowFeeCoverage: invoice.allowFeeCoverage,
    paymentHistory: payments.map((p) => ({
      date: p.createdAt,
      method: p.method,
      grossAmountCents: p.grossAmountCents,
      feeContributionCents: p.feeContributionCents,
      totalChargedCents: p.totalChargedCents,
      customerCoveredFee: p.customerCoveredFee,
      refundedCents: p.refundedCents,
      status: p.status,
    })),
    branding,
    churchName: church?.name || "the organization",
    finixMerchantId: church?.finixMerchantId || null,
    finixApplicationId: process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || null,
    finixEnvironment: (process.env.NEXT_PUBLIC_FINIX_ENV as "sandbox" | "live") || "sandbox",
    googlePayGatewayMerchantId,
    googlePayMerchantId,
    googlePayEnvironment,
  });
}
