import { prisma } from "@/lib/prisma";

/**
 * Shared data loader for a single deposit's full detail view — used by both
 * the right-side drawer and the "View All Details" page so the two never
 * drift apart, mirroring loadRefundDetail / loadBankReturnDetail.
 *
 * A deposit is Finix's funding_transfer_attempt: the actual movement of
 * settled funds out to the church's connected bank account. Each one
 * bundles one or more settlements, which in turn bundle payments. We
 * follow those joins here so the detail view can show which payments and
 * refunds actually made up the money that hit the bank.
 */
export async function loadDepositDetail(depositId: string, churchId: string) {
  const deposit = await prisma.finixFundingTransferAttempt.findFirst({
    where: { finixFundingTransferAttemptId: depositId, churchId },
  });
  if (!deposit) return null;

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  // Finix's funding attempt links to a single settlement id today, but the
  // spec treats it as a bundle — this pulls just that one settlement,
  // plus any others we've explicitly seen linked to the same deposit
  // through the transfer path. Ordered so the primary settlement is first.
  const settlements = deposit.finixSettlementId
    ? await prisma.finixSettlement.findMany({
        where: { finixSettlementId: deposit.finixSettlementId, churchId },
      })
    : [];

  const settlementIds = settlements.map((s) => s.finixSettlementId);
  const payments = settlementIds.length
    ? await prisma.finixTransfer.findMany({
        where: { churchId, finixSettlementId: { in: settlementIds } },
      })
    : [];

  const paymentIds = payments.map((p) => p.finixTransferId);
  const affectingRefunds = paymentIds.length
    ? await prisma.finixRefundOrReversal.findMany({
        where: { churchId, finixOriginalTransferId: { in: paymentIds } },
      })
    : [];
  const affectingReturns = paymentIds.length
    ? await prisma.bankReturn.findMany({
        where: { churchId, originalTransferId: { in: paymentIds } },
      })
    : [];

  return { deposit, church, settlements, payments, affectingRefunds, affectingReturns };
}

export type DepositDetail = NonNullable<Awaited<ReturnType<typeof loadDepositDetail>>>;
