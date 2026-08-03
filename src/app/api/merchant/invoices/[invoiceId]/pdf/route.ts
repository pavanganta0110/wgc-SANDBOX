import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { generateInvoicePdf } from "@/lib/invoices/generateInvoicePdf";

/**
 * Merchant-facing PDF download. Never mints a fresh public token just to
 * put a QR code on this — see generateInvoicePdf's doc comment — so this
 * renders with a working QR/pay-link only when an ACTIVE token already
 * exists whose raw value happens to be... it never does, since raw tokens
 * aren't persisted. In practice this download simply omits the QR/link
 * block; the merchant's own dashboard is the place to copy/regenerate the
 * actual payment link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canViewInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const pdf = await generateInvoicePdf(invoice.id, null);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
