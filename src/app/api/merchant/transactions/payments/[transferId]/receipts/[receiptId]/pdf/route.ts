import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { DonationReceiptPdf } from "@/lib/giving/pdf/DonationReceiptPdf";
import { buildDonationReceiptPdfProps } from "@/lib/giving/generateReceipt";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

/**
 * Renders a previously-issued receipt for viewing/download — the first
 * place a merchant can actually see receipt content rather than just a
 * sent/not-sent status. Re-renders on demand from the same
 * DonationReceiptPdf component every send already uses, combining the
 * receipt's own pinned financial/legal snapshot (amount, goods/services,
 * acknowledgment text — exactly what was true when this version was sent)
 * with the donor/organization's current display details (name, branding).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ transferId: string; receiptId: string }> }
) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { transferId, receiptId } = await params;

  const viewScope = await resolveViewScope(auth);
  const transferScope = await buildFinixTransferScope(auth, viewScope);
  const transfer = await prisma.finixTransfer.findFirst({
    where: { AND: [{ finixTransferId: transferId }, transferScope] },
  });
  if (!transfer) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const payment = await prisma.payment.findFirst({
    where: { finixTransferId: transferId, churchId: auth.churchId },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const receipt = await prisma.donationReceipt.findFirst({
    where: { id: receiptId, paymentId: payment.id, churchId: auth.churchId },
  });
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const { props } = await buildDonationReceiptPdfProps(payment, auth.churchId, {
    receiptNumber: receipt.receiptNumber,
    paymentAmountCents: receipt.paymentAmountCentsSnapshot,
    goodsServicesProvided: receipt.goodsServicesProvidedSnapshot,
    goodsServicesDescription: receipt.goodsServicesDescriptionSnapshot,
    goodsServicesFairMarketValueCents: receipt.goodsServicesFairMarketValueCentsSnapshot,
    recordedContributionAmountCents: receipt.recordedContributionAmountCentsSnapshot ?? receipt.paymentAmountCentsSnapshot,
    acknowledgmentText: receipt.acknowledgmentTextSnapshot,
  });

  const pdf = await renderToBuffer(DonationReceiptPdf(props));

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${receipt.receiptNumber}${receipt.version > 1 ? `-v${receipt.version}` : ""}.pdf"`,
    },
  });
}
