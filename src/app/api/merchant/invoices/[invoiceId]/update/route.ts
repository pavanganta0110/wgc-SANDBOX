import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { parseAndCalculateLineItems, totalsFromParsedItems } from "@/lib/invoices/invoiceLineItemInput";
import { canEditFinancials, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

const VALID_CLASSIFICATIONS = ["GOODS_OR_SERVICES", "CHARITABLE_DONATION", "PARTIAL_DONATION"];

export async function POST(req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canEditInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { invoiceId } = await params;
  const existing = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  // Fundraiser scoping: a fundraiser can only edit invoices they created,
  // per the approved spec ("Edit their own drafts"). Owner/admin can edit
  // any invoice they have canEditInvoices for.
  if (auth.role === "fundraiser" && existing.createdByUserId !== auth.userId) {
    return NextResponse.json({ error: "You can only edit invoices you created." }, { status: 403 });
  }

  const hasSuccessfulPayment = (await prisma.invoicePayment.count({ where: { invoiceId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } })) > 0;
  if (!canEditFinancials(existing.status as InvoiceStatus, hasSuccessfulPayment)) {
    return NextResponse.json({ error: "This invoice can no longer be edited — it has been paid, voided, or marked uncollectible." }, { status: 409 });
  }

  const body = await req.json();

  if (body.clientId) {
    const client = await prisma.client.findFirst({ where: { id: body.clientId, churchId: auth.churchId } });
    if (!client) {
      return NextResponse.json({ error: "Client not found in this organization." }, { status: 400 });
    }
  }

  const dueDate = body.dueDate ? new Date(body.dueDate) : existing.dueDate;
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "A valid due date is required." }, { status: 400 });
  }

  const lineItemsResult = parseAndCalculateLineItems(body.lineItems);
  if (!lineItemsResult.valid) {
    return NextResponse.json({ error: lineItemsResult.error }, { status: 400 });
  }

  const invoiceLevelDiscountCents = Number.isFinite(Number(body.discountCents)) ? Math.max(0, Number(body.discountCents)) : 0;
  const serviceFeeCents = Number.isFinite(Number(body.serviceFeeCents)) ? Math.max(0, Number(body.serviceFeeCents)) : 0;
  const totals = totalsFromParsedItems(lineItemsResult.items, invoiceLevelDiscountCents, serviceFeeCents);

  const classification = typeof body.classification === "string" && VALID_CLASSIFICATIONS.includes(body.classification) ? body.classification : existing.classification;

  const invoice = await prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        clientId: body.clientId || existing.clientId,
        classification,
        goodsServicesValueCents: Number.isFinite(Number(body.goodsServicesValueCents)) ? Number(body.goodsServicesValueCents) : null,
        charitablePortionCents: Number.isFinite(Number(body.charitablePortionCents)) ? Number(body.charitablePortionCents) : null,
        linkedDonorId: cleanString(body.linkedDonorId),
        noGoodsOrServicesConfirmed: Boolean(body.noGoodsOrServicesConfirmed),
        title: cleanString(body.title, 200),
        poReference: cleanString(body.poReference, 100),
        internalNotes: cleanString(body.internalNotes, 5000),
        clientMemo: cleanString(body.clientMemo, 5000),
        paymentInstructions: cleanString(body.paymentInstructions, 2000),
        termsAndConditions: cleanString(body.termsAndConditions, 5000),
        dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        serviceFeeCents: totals.serviceFeeCents,
        totalCents: totals.totalCents,
        balanceCents: totals.totalCents,
        allowCard: body.allowCard !== false,
        allowAch: body.allowAch !== false,
        allowApplePay: body.allowApplePay !== false,
        allowGooglePay: body.allowGooglePay !== false,
        allowPartialPayments: Boolean(body.allowPartialPayments),
        minimumPartialPaymentCents: Number.isFinite(Number(body.minimumPartialPaymentCents)) ? Number(body.minimumPartialPaymentCents) : null,
        allowFeeCoverage: body.allowFeeCoverage !== false,
        feeCoveredBy: body.feeCoveredBy === "CLIENT" ? "CLIENT" : "MERCHANT",
        autoCloseWhenPaid: body.autoCloseWhenPaid !== false,
        templateName: typeof body.templateName === "string" ? body.templateName : existing.templateName,
        accentColor: cleanString(body.accentColor, 20),
      },
    });

    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
    await tx.invoiceLineItem.createMany({
      data: lineItemsResult.items.map((item) => ({
        invoiceId,
        churchId: auth.churchId,
        description: item.input.description,
        detailedDescription: item.input.detailedDescription,
        quantity: item.input.quantity,
        unitPriceCents: item.input.unitPriceCents,
        discountType: item.input.discountType,
        discountValue: item.input.discountValue,
        taxRateBasisPoints: item.input.taxRateBasisPoints,
        taxAmountCents: item.calculated.taxAmountCents,
        totalCents: item.calculated.totalCents,
        sortOrder: item.input.sortOrder,
        productCode: item.input.productCode,
      })),
    });

    return updated;
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.edited",
    entityType: "invoice",
    entityId: invoiceId,
    req,
  });

  return NextResponse.json({ success: true, invoice });
}
