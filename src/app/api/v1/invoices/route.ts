import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError, parsePagination, paginationMeta } from "@/lib/api/response";
import { findIdempotentReplay, storeIdempotentResponse } from "@/lib/api/idempotency";
import { parseAndCalculateLineItems, totalsFromParsedItems } from "@/lib/invoices/invoiceLineItemInput";
import { generateNextInvoiceNumber } from "@/lib/invoices/invoiceNumber";
import { emitEvent } from "@/lib/events/emitEvent";

export const GET = withApiAuth("invoices:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;

  const invoices = await prisma.invoice.findMany({
    where: { churchId: auth.churchId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      invoiceNumber: true,
      clientId: true,
      status: true,
      totalCents: true,
      balanceCents: true,
      amountPaidCents: true,
      issueDate: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  });

  const { page, hasMore, nextCursor } = paginationMeta(invoices, limit);
  return apiSuccess(page, requestId, { hasMore, nextCursor });
});

export const POST = withApiAuth("invoices:write", async (req, auth, requestId) => {
  const idempotencyKey = req.headers.get("idempotency-key");
  const path = new URL(req.url).pathname;
  if (idempotencyKey) {
    const replay = await findIdempotentReplay(auth.apiKeyId, idempotencyKey, "POST", path);
    if (replay) return replay;
  }

  const body = await req.json().catch(() => ({}));
  const { clientId, dueDate, lineItems } = body;

  if (!clientId || typeof clientId !== "string") {
    return apiError("validation_error", "`clientId` is required.", requestId);
  }
  const client = await prisma.client.findFirst({ where: { id: clientId, churchId: auth.churchId } });
  if (!client) return apiError("validation_error", "`clientId` does not refer to a client in this organization.", requestId);

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (!parsedDueDate || Number.isNaN(parsedDueDate.getTime())) {
    return apiError("validation_error", "A valid `dueDate` is required.", requestId);
  }

  const lineItemsResult = parseAndCalculateLineItems(lineItems);
  if (!lineItemsResult.valid) {
    return apiError("validation_error", lineItemsResult.error ?? "Invalid line items.", requestId);
  }

  const totals = totalsFromParsedItems(lineItemsResult.items, 0, 0);
  const invoiceNumber = await generateNextInvoiceNumber(auth.churchId);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        churchId: auth.churchId,
        invoiceNumber,
        clientId,
        status: "DRAFT",
        classification: "GOODS_OR_SERVICES",
        issueDate: new Date(),
        dueDate: parsedDueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        serviceFeeCents: totals.serviceFeeCents,
        totalCents: totals.totalCents,
        balanceCents: totals.totalCents,
        allowCard: true,
        allowAch: true,
        allowApplePay: true,
        allowGooglePay: true,
        feeCoveredBy: "MERCHANT",
        autoCloseWhenPaid: true,
        templateName: "CLASSIC",
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

  try {
    await emitEvent({ type: "invoice.created", churchId: auth.churchId, data: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, totalCents: invoice.totalCents, source: "api" } });
  } catch (err) {
    console.error("Failed to emit invoice.created event (API):", err);
  }

  const response = apiSuccess(invoice, requestId);
  if (idempotencyKey) {
    const bodyForCache = await response.clone().json();
    await storeIdempotentResponse(auth.apiKeyId, idempotencyKey, "POST", path, response.status, bodyForCache);
  }
  return response;
});
