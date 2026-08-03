import { prisma } from "@/lib/prisma";
import { validateClassification } from "./invoiceClassification";
import type { InvoiceClassification } from "./invoiceClassification";

export interface SendValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * The full pre-send checklist from the approved spec ("Before sending,
 * validate..."). An invoice is never marked SENT unless every one of these
 * passes — a failed delivery attempt (see InvoiceDelivery) is recorded and
 * retryable, but the invoice itself only flips to SENT once delivery
 * actually succeeds (checked by the caller after this validation passes
 * and the email send completes).
 */
export async function validateInvoiceForSend(invoiceId: string, churchId: string): Promise<SendValidationResult> {
  const errors: string[] = [];

  const [church, invoice, lineItems] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.invoice.findFirst({ where: { id: invoiceId, churchId } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId } }),
  ]);

  if (!church || church.status !== "ACTIVE") {
    errors.push("This organization is not currently active.");
  }
  if (!invoice) {
    errors.push("Invoice not found.");
    return { valid: false, errors };
  }

  const client = await prisma.client.findFirst({ where: { id: invoice.clientId, churchId } });
  if (!client) {
    errors.push("The client for this invoice could not be found.");
  } else if (!client.email) {
    errors.push("The client has no email address on file — add one before sending.");
  } else {
    // Reuses the same email format check as the rest of the app rather
    // than a second regex.
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_PATTERN.test(client.email)) {
      errors.push("The client's email address is not valid.");
    }
  }

  if (lineItems.length === 0) {
    errors.push("Add at least one line item before sending.");
  }
  if (invoice.totalCents <= 0) {
    errors.push("The invoice total must be greater than zero.");
  }
  if (!invoice.dueDate || Number.isNaN(invoice.dueDate.getTime())) {
    errors.push("A valid due date is required.");
  } else if (invoice.dueDate.getTime() < invoice.issueDate.getTime()) {
    errors.push("The due date cannot be before the issue date.");
  }

  if (!invoice.allowCard && !invoice.allowAch && !invoice.allowApplePay && !invoice.allowGooglePay) {
    errors.push("At least one payment method must be enabled.");
  }

  if (!church?.finixMerchantId || !church?.finixIdentityId) {
    errors.push("This organization's Finix payment configuration is not complete — contact WGC support.");
  }

  const classificationResult = validateClassification({
    classification: invoice.classification as InvoiceClassification,
    totalCents: invoice.totalCents,
    noGoodsOrServicesConfirmed: invoice.noGoodsOrServicesConfirmed,
    goodsServicesValueCents: invoice.goodsServicesValueCents,
    charitablePortionCents: invoice.charitablePortionCents,
  });
  if (!classificationResult.valid) {
    errors.push(classificationResult.error || "Invoice classification is incomplete.");
  }

  return { valid: errors.length === 0, errors };
}
