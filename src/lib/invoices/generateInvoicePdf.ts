import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { resolveInvoiceBranding, applyInvoiceOverrides } from "./invoiceBranding";
import { InvoicePdf, type InvoicePdfProps } from "./pdf/InvoicePdf";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";

/**
 * Builds the invoice PDF buffer. `payUrlToken`, when provided, is a raw
 * public token this call already has in hand (e.g. the public /pdf route,
 * which has it from its own URL) — it's used to render a pay-online QR
 * code. When omitted, the PDF renders without a QR/link section rather
 * than minting a fresh token just to embed it: this codebase never
 * persists a raw token for later reuse (see invoicePublicToken.ts), so a
 * merchant re-downloading a PDF after the original send has no raw token
 * available, and silently regenerating one here would invalidate whatever
 * link was already emailed to the client — worse than just omitting the
 * QR code from this one supplementary document.
 */
export async function generateInvoicePdf(invoiceId: string, payUrlToken?: string | null): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");

  const [client, lineItems] = await Promise.all([
    prisma.client.findUnique({ where: { id: invoice.clientId } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" } }),
  ]);

  const branding = applyInvoiceOverrides(await resolveInvoiceBranding(invoice.churchId), invoice);

  const clientAddress = client?.billingAddressLine1
    ? [client.billingAddressLine1, client.billingAddressLine2, [client.billingCity, client.billingState, client.billingPostalCode].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(", ")
    : null;

  const payUrl = payUrlToken ? `${APP_URL}/invoice/${payUrlToken}` : null;
  const qrCodeDataUrl = payUrl ? await QRCode.toDataURL(payUrl, { width: 320, margin: 1 }) : null;

  const props: InvoicePdfProps = {
    organizationName: branding.organizationDisplayName,
    organizationLogoUrl: branding.logoUrl,
    organizationAddress: branding.organizationAddress,
    organizationEmail: branding.organizationSupportEmail,
    organizationPhone: branding.organizationPhone,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    clientName: client?.displayName || "Client",
    clientEmail: client?.email || null,
    clientAddress,
    title: invoice.title,
    lineItems: lineItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPriceCents: li.unitPriceCents, totalCents: li.totalCents })),
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    taxCents: invoice.taxCents,
    serviceFeeCents: invoice.serviceFeeCents,
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.amountPaidCents,
    balanceCents: invoice.balanceCents,
    clientMemo: invoice.clientMemo,
    paymentInstructions: invoice.paymentInstructions,
    termsAndConditions: invoice.termsAndConditions,
    footerMessage: branding.footerMessage,
    qrCodeDataUrl,
    payUrl,
  };

  return renderToBuffer(InvoicePdf(props)) as unknown as Promise<Buffer>;
}
