import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { parseAndCalculateLineItems, totalsFromParsedItems } from "@/lib/invoices/invoiceLineItemInput";
import { generateNextInvoiceNumber, isValidCustomInvoiceNumber } from "@/lib/invoices/invoiceNumber";

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002");
}

const VALID_CLASSIFICATIONS = ["GOODS_OR_SERVICES", "CHARITABLE_DONATION", "PARTIAL_DONATION"];

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canCreateInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const body = await req.json();

  const clientId = cleanString(body.clientId);
  if (!clientId) {
    return NextResponse.json({ error: "A client is required." }, { status: 400 });
  }
  const client = await prisma.client.findFirst({ where: { id: clientId, churchId: auth.churchId } });
  if (!client) {
    return NextResponse.json({ error: "Client not found in this organization." }, { status: 400 });
  }

  const classification = typeof body.classification === "string" && VALID_CLASSIFICATIONS.includes(body.classification) ? body.classification : "GOODS_OR_SERVICES";

  const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "A valid due date is required." }, { status: 400 });
  }

  const lineItemsResult = parseAndCalculateLineItems(body.lineItems);
  if (!lineItemsResult.valid) {
    return NextResponse.json({ error: lineItemsResult.error }, { status: 400 });
  }

  const invoiceLevelDiscountCents = Number.isFinite(Number(body.discountCents)) ? Math.max(0, Number(body.discountCents)) : 0;
  const serviceFeeCents = Number.isFinite(Number(body.serviceFeeCents)) ? Math.max(0, Number(body.serviceFeeCents)) : 0;
  const totals = totalsFromParsedItems(lineItemsResult.items, invoiceLevelDiscountCents, serviceFeeCents);

  let invoiceNumber: string;
  const customNumber = cleanString(body.invoiceNumber, 50);
  if (customNumber) {
    if (!isValidCustomInvoiceNumber(customNumber)) {
      return NextResponse.json({ error: "Invalid custom invoice number." }, { status: 400 });
    }
    invoiceNumber = customNumber;
  } else {
    invoiceNumber = await generateNextInvoiceNumber(auth.churchId);
  }

  try {
    // No Prisma relation exists between Invoice and InvoiceLineItem
    // (matching this schema's no-cross-model-relations convention), so the
    // invoice and its line items are created in a single transaction
    // rather than a nested-create — both succeed or both roll back.
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          churchId: auth.churchId,
          invoiceNumber,
          clientId,
          status: "DRAFT",
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
          issueDate,
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
          templateName: typeof body.templateName === "string" ? body.templateName : "CLASSIC",
          accentColor: cleanString(body.accentColor, 20),
          createdByUserId: auth.userId,
          createdByEmail: auth.email,
        },
      });

      await tx.invoiceLineItem.createMany({
        data: lineItemsResult.items.map((item) => ({
          invoiceId: created.id,
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

      return created;
    });

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "invoice.created",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, totalCents: invoice.totalCents },
      req,
    });

    // Invoice-feature usage ledger — recorded for future pricing/reporting
    // regardless of whether invoice billing is active; never itself
    // creates a charge (see invoiceUsageLedger.ts doc comment).
    const { recordInvoiceUsageEvent } = await import("@/lib/billing/invoiceUsageLedger");
    await recordInvoiceUsageEvent({
      organizationId: auth.churchId,
      invoiceId: invoice.id,
      eventType: "INVOICE_CREATED",
      invoiceAmountCents: invoice.totalCents,
      idempotencyKey: `${invoice.id}:INVOICE_CREATED`,
    }).catch((err) => console.error("Invoice usage ledger recording failed (non-fatal):", err));

    return NextResponse.json({ success: true, invoice });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "That invoice number is already in use for this organization." }, { status: 409 });
    }
    throw err;
  }
}
