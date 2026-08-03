import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { generateNextInvoiceNumber } from "@/lib/invoices/invoiceNumber";

/** Duplicates an invoice as a brand-new DRAFT with a fresh invoice number —
 * always a full copy of the current financial snapshot, never a reference
 * back to the original (so later edits to either are fully independent). */
export async function POST(req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
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

  const { invoiceId } = await params;
  const [original, lineItems] = await Promise.all([
    prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!original) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const invoiceNumber = await generateNextInvoiceNumber(auth.churchId);
  const today = new Date();
  const dueDate = new Date(today.getTime() + (original.dueDate.getTime() - original.issueDate.getTime()));

  const duplicate = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        churchId: auth.churchId,
        invoiceNumber,
        clientId: original.clientId,
        status: "DRAFT",
        classification: original.classification,
        goodsServicesValueCents: original.goodsServicesValueCents,
        charitablePortionCents: original.charitablePortionCents,
        linkedDonorId: original.linkedDonorId,
        noGoodsOrServicesConfirmed: original.noGoodsOrServicesConfirmed,
        title: original.title,
        poReference: null,
        internalNotes: original.internalNotes,
        clientMemo: original.clientMemo,
        paymentInstructions: original.paymentInstructions,
        termsAndConditions: original.termsAndConditions,
        issueDate: today,
        dueDate,
        subtotalCents: original.subtotalCents,
        discountCents: original.discountCents,
        taxCents: original.taxCents,
        serviceFeeCents: original.serviceFeeCents,
        totalCents: original.totalCents,
        balanceCents: original.totalCents,
        allowCard: original.allowCard,
        allowAch: original.allowAch,
        allowApplePay: original.allowApplePay,
        allowGooglePay: original.allowGooglePay,
        allowPartialPayments: original.allowPartialPayments,
        minimumPartialPaymentCents: original.minimumPartialPaymentCents,
        feeCoveredBy: original.feeCoveredBy,
        autoCloseWhenPaid: original.autoCloseWhenPaid,
        templateName: original.templateName,
        accentColor: original.accentColor,
        createdByUserId: auth.userId,
        createdByEmail: auth.email,
      },
    });

    if (lineItems.length > 0) {
      await tx.invoiceLineItem.createMany({
        data: lineItems.map((li) => ({
          invoiceId: created.id,
          churchId: auth.churchId,
          description: li.description,
          detailedDescription: li.detailedDescription,
          quantity: li.quantity,
          unitPriceCents: li.unitPriceCents,
          discountType: li.discountType,
          discountValue: li.discountValue,
          taxRateBasisPoints: li.taxRateBasisPoints,
          taxAmountCents: li.taxAmountCents,
          totalCents: li.totalCents,
          sortOrder: li.sortOrder,
          productCode: li.productCode,
        })),
      });
    }

    return created;
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.duplicated",
    entityType: "invoice",
    entityId: duplicate.id,
    metadata: { duplicatedFromInvoiceId: invoiceId },
    req,
  });

  return NextResponse.json({ success: true, invoice: duplicate });
}
