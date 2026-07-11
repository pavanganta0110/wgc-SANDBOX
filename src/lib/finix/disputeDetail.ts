import { prisma } from "@/lib/prisma";

/**
 * Shared data loader for a single dispute's full detail view — used by both
 * the right-side drawer and the full detail page, mirroring loadRefundDetail/
 * loadDepositDetail's pattern so the two never drift and every join happens
 * exactly once per request (no per-section N+1 queries).
 */
export async function loadDisputeDetail(disputeId: string, churchId: string) {
  const dispute = await prisma.finixDispute.findFirst({
    where: { finixDisputeId: disputeId, churchId },
    include: { evidence: { orderBy: { createdAt: "desc" } } },
  });
  if (!dispute) return null;

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const transfer = dispute.finixTransferId
    ? await prisma.finixTransfer.findFirst({ where: { finixTransferId: dispute.finixTransferId, churchId } })
    : null;

  const instrument = transfer?.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId },
      })
    : null;

  const donor = instrument?.donorId ? await prisma.donor.findUnique({ where: { id: instrument.donorId } }) : null;

  const settlement = transfer?.finixSettlementId
    ? await prisma.finixSettlement.findUnique({ where: { finixSettlementId: transfer.finixSettlementId } })
    : null;

  const deposit = settlement
    ? await prisma.finixFundingTransferAttempt.findFirst({
        where: { finixSettlementId: settlement.finixSettlementId },
        orderBy: { createdAtFinix: "desc" },
      })
    : null;

  // A dispute loss can generate a real reversal transfer against the
  // original payment — only surfaced in the timeline/financial-impact
  // sections if one actually exists, never assumed.
  const disputeReversal = transfer
    ? await prisma.finixRefundOrReversal.findFirst({
        where: { finixOriginalTransferId: transfer.finixTransferId, churchId },
        orderBy: { createdAtFinix: "desc" },
      })
    : null;

  const payment = transfer
    ? await prisma.payment.findFirst({ where: { finixTransferId: transfer.finixTransferId, churchId } })
    : null;

  const activeEvidence = dispute.evidence.filter((e) => !e.deletedAt);

  return { dispute, church, transfer, instrument, donor, settlement, deposit, disputeReversal, payment, activeEvidence };
}

export type DisputeDetail = NonNullable<Awaited<ReturnType<typeof loadDisputeDetail>>>;
