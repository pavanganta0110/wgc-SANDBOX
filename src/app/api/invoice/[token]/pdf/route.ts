import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { checkInvoiceViewRateLimit } from "@/lib/invoices/invoicePublicRateLimit";
import { generateInvoicePdf } from "@/lib/invoices/generateInvoicePdf";

/** Public, unauthenticated PDF download for the payer — reuses the exact
 * token from the URL to render the pay-online QR code, so no new token is
 * minted and no existing link is invalidated by downloading this. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkInvoiceViewRateLimit(`pdf:${ip}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const resolved = await resolveInvoicePublicToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "This invoice link is invalid." }, { status: 404 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: resolved.invoiceId } });
  if (!invoice || invoice.churchId !== resolved.churchId) {
    return NextResponse.json({ error: "This invoice link is invalid." }, { status: 404 });
  }

  const pdf = await generateInvoicePdf(invoice.id, token);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
