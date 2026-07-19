import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";

import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

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

  const instrument = transfer.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId },
      })
    : null;
  const donor = instrument?.donorId ? await prisma.donor.findUnique({ where: { id: instrument.donorId } }) : null;

  if (!donor?.email) {
    return NextResponse.json({ error: "No donor email on file for this payment." }, { status: 400 });
  }

  try {
    await finixClient.createReceipt({
      entity_id: transferId,
      send_receipt_to_buyer: true,
      requested_delivery_methods: [{ type: "EMAIL", destinations: [donor.email] }],
    });

    await prisma.payment.updateMany({
      where: { finixTransferId: transferId, churchId: auth.churchId },
      data: { receiptStatus: "SENT", receiptSentAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Receipt send failed for transfer ${transferId}:`, error);
    return toSafeErrorResponse(error, 402, {
      userId: auth.userId,
      organizationId: auth.churchId,
      route: `/api/merchant/transactions/payments/${transferId}/receipt`,
      action: "SEND_RECEIPT",
      resourceId: transferId,
    });
  }
}
