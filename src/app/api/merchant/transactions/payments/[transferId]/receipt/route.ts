import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";

import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

export async function POST(_req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return toSafeErrorResponse("You do not have permission to perform this action.", 401);
  }

  const { transferId } = await params;

  const transfer = await prisma.finixTransfer.findFirst({
    where: { finixTransferId: transferId, churchId: session.churchId },
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
      where: { finixTransferId: transferId, churchId: session.churchId },
      data: { receiptStatus: "SENT", receiptSentAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Receipt send failed for transfer ${transferId}:`, error);
    return toSafeErrorResponse(error, 402, {
      userId: session.userId,
      organizationId: session.churchId,
      route: `/api/merchant/transactions/payments/${transferId}/receipt`,
      action: "SEND_RECEIPT",
      resourceId: transferId,
    });
  }
}
