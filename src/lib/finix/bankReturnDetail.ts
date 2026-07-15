import { prisma } from "@/lib/prisma";

/**
 * Shared data loader for a single bank return's full detail view — used by
 * both the right-side drawer and the "View All Details" page, mirroring
 * loadRefundDetail's pattern so the two views never drift apart.
 */
export async function loadBankReturnDetail(bankReturnId: string, churchId: string) {
  const bankReturn = await prisma.bankReturn.findFirst({
    where: { bankReturnId, churchId },
  });
  if (!bankReturn) return null;

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const transfer = bankReturn.originalTransferId
    ? await prisma.finixTransfer.findUnique({ where: { finixTransferId: bankReturn.originalTransferId } })
    : null;

  const instrument = bankReturn.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: bankReturn.finixPaymentInstrumentId },
      })
    : null;

  const donor = bankReturn.buyerId
    ? await prisma.donor.findUnique({ where: { id: bankReturn.buyerId } })
    : instrument?.donorId
      ? await prisma.donor.findUnique({ where: { id: instrument.donorId } })
      : null;

  const settlement = transfer?.finixSettlementId
    ? await prisma.finixSettlement.findUnique({ where: { finixSettlementId: transfer.finixSettlementId } })
    : null;

  const payment = bankReturn.originalTransferId
    ? await prisma.payment.findFirst({
        where: { finixTransferId: bankReturn.originalTransferId, churchId },
      })
    : null;

  const payout = transfer?.finixSettlementId
    ? await prisma.finixFundingTransferAttempt.findFirst({
        where: { finixSettlementId: transfer.finixSettlementId },
      })
    : null;

  return { bankReturn, church, transfer, instrument, donor, settlement, payment, payout };
}

type BankReturnDetail = NonNullable<Awaited<ReturnType<typeof loadBankReturnDetail>>>;
