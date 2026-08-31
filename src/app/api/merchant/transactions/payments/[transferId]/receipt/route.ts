import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";

import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

// Previously called finixClient.createReceipt() — Finix's own hosted
// receipt API, a separate, unconfirmed path from the app's own receipt
// generator (sendDonationReceipt, used everywhere else a receipt is
// actually sent: the Finix webhook, take-payment, goods/services
// correction, reconciliation). That path produced no record anywhere of
// what was actually sent and had no confirmed working behavior. This
// button now uses the same generator as every other receipt send, so it
// actually works and creates a real, viewable DonationReceipt row.
export async function POST(_req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { transferId } = await params;

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

  try {
    await sendDonationReceipt(payment.id, auth.churchId, auth.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Receipt send failed for transfer ${transferId}:`, error);
    return toSafeErrorResponse(error, 400, {
      userId: auth.userId,
      organizationId: auth.churchId,
      route: `/api/merchant/transactions/payments/${transferId}/receipt`,
      action: "SEND_RECEIPT",
      resourceId: transferId,
    });
  }
}
