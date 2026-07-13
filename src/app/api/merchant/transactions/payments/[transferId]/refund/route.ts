import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { redactFinixPayload } from "@/lib/finix/redact";
import { checkRefundEligibility } from "@/lib/payments/refundEligibility";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

export async function POST(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return toSafeErrorResponse("You do not have permission to perform this action.", 401);
  }

  const { transferId } = await params;

  const [transfer, refunds, bankReturns] = await Promise.all([
    prisma.finixTransfer.findFirst({
      where: { finixTransferId: transferId, churchId: session.churchId },
    }),
    prisma.finixRefundOrReversal.findMany({
      where: { finixOriginalTransferId: transferId, churchId: session.churchId },
    }),
    prisma.bankReturn.findMany({
      where: { originalTransferId: transferId, churchId: session.churchId },
    }),
  ]);

  if (!transfer) {
    return toSafeErrorResponse("This record could not be found.", 404);
  }

  const eligibility = checkRefundEligibility(transfer, refunds, bankReturns, session.churchId);
  if (!eligibility.eligible) {
    return toSafeErrorResponse(eligibility.reason || "This transaction is not eligible for a refund.", 400);
  }

  const body = await req.json().catch(() => ({}));
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : undefined;

  if (amountCents != null && (amountCents <= 0 || amountCents > (transfer.amountCents ?? 0))) {
    return toSafeErrorResponse("The refund amount cannot exceed the remaining refundable balance.", 400);
  }

  try {
    const reversal = await finixClient.createTransferReversal(transferId, {
      ...(amountCents != null ? { refund_amount: amountCents } : {}),
      tags: { source: "wgc_merchant_dashboard", merchantId: transfer.finixMerchantId ?? "", churchId: session.churchId },
    });

    // Persist immediately so the UI reflects it right away
    await prisma.finixRefundOrReversal.upsert({
      where: { finixReversalId: reversal.id },
      create: {
        finixReversalId: reversal.id,
        churchId: session.churchId,
        finixOriginalTransferId: transferId,
        finixMerchantId: transfer.finixMerchantId,
        amountCents: reversal.amount ?? amountCents ?? transfer.amountCents,
        currency: reversal.currency ?? transfer.currency,
        state: reversal.state ?? "PENDING",
        type: reversal.type ?? "REVERSAL",
        subtype: reversal.subtype ?? null,
        source: "wgc_merchant_dashboard",
        rawJsonRedacted: redactFinixPayload(reversal),
        createdAtFinix: reversal.created_at ? new Date(reversal.created_at) : new Date(),
        lastSyncedAt: new Date(),
      },
      update: {
        state: reversal.state ?? undefined,
        rawJsonRedacted: redactFinixPayload(reversal),
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, reversalId: reversal.id, state: reversal.state });
  } catch (error: any) {
    console.error(`Refund failed for transfer ${transferId}:`, error);
    return toSafeErrorResponse(error, 400, {
      userId: session.userId,
      organizationId: session.churchId,
      route: `/api/merchant/transactions/payments/${transferId}/refund`,
      action: "CREATE_REFUND",
      resourceId: transferId,
    });
  }
}
