import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderDonationReceiptPdfForPayment } from "@/lib/giving/generateReceipt";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

/**
 * The payment's receipt as a PDF for viewing or printing — works whether or not a receipt was ever emailed (a phone
 * payment taken without a payer email has none). Renders the latest issued version when one exists, otherwise the
 * receipt that would be sent, and records nothing. Same payment scoping as the receipt send route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { transferId } = await params;

  const viewScope = await resolveViewScope(auth);
  const transferScope = await buildFinixTransferScope(auth, viewScope);
  const transfer = await prisma.finixTransfer.findFirst({
    where: { AND: [{ finixTransferId: transferId }, transferScope] },
  });
  if (!transfer) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const payment = await prisma.payment.findFirst({
    where: { finixTransferId: transferId, churchId: auth.churchId },
    select: { id: true },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const { pdf, fileName } = await renderDonationReceiptPdfForPayment(payment.id, auth.churchId);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
