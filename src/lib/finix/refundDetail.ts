import { prisma } from "@/lib/prisma";
import { computeRefundStatus } from "@/lib/finix/refundStatus";

export type RefundEffectiveType = "FULL" | "PARTIAL" | null;

/**
 * Shared data loader for a single refund's full detail view — used by both
 * the right-side drawer and the "View All Details" page so the two never
 * drift out of sync on what fields they show or how they're resolved.
 */
export async function loadRefundDetail(finixReversalId: string, churchId: string) {
  const refund = await prisma.finixRefundOrReversal.findFirst({
    where: { finixReversalId, churchId },
  });
  if (!refund) return null;

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const transfer = refund.finixOriginalTransferId
    ? await prisma.finixTransfer.findUnique({ where: { finixTransferId: refund.finixOriginalTransferId } })
    : null;

  const instrument = transfer?.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId },
      })
    : null;

  const donor = instrument?.donorId
    ? await prisma.donor.findUnique({ where: { id: instrument.donorId } })
    : null;

  // Full vs Partial is relative to ALL refunds against the original
  // transfer, not just this one row — reuses the same computed-on-read
  // aggregation already trusted everywhere else refund status is shown.
  const allRefundsForTransfer = refund.finixOriginalTransferId
    ? await prisma.finixRefundOrReversal.findMany({
        where: { finixOriginalTransferId: refund.finixOriginalTransferId },
      })
    : [refund];
  const aggregate = transfer ? computeRefundStatus(transfer, allRefundsForTransfer) : null;
  const refundType: RefundEffectiveType =
    (refund.state || "").toUpperCase() === "SUCCEEDED"
      ? aggregate?.refundStatus === "FULL"
        ? "FULL"
        : aggregate?.refundStatus === "PARTIAL"
          ? "PARTIAL"
          : null
      : null;

  const settlement = refund.finixSettlementId
    ? await prisma.finixSettlement.findUnique({ where: { finixSettlementId: refund.finixSettlementId } })
    : null;

  const payment = refund.finixOriginalTransferId
    ? await prisma.payment.findFirst({
        where: { finixTransferId: refund.finixOriginalTransferId, churchId },
      })
    : null;

  return { refund, church, transfer, instrument, donor, refundType, settlement, payment };
}

export type RefundDetail = NonNullable<Awaited<ReturnType<typeof loadRefundDetail>>>;
