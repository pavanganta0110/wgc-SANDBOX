import { prisma } from "@/lib/prisma";
import { refreshSettlementAndDepositFromFinix, isStaleEnoughToRefresh } from "@/lib/finix/sync/settlementFundingSync";

/**
 * Shared data loader for a single settlement's full detail view — used by
 * both the right-side drawer and the full detail page, mirroring
 * loadDisputeDetail's pattern so the two never drift and every related
 * table is fetched with one batch query (by transferId list) instead of
 * per-row, no matter how many payments a settlement includes.
 *
 * Per the "do not rely only on webhooks" requirement: reads the local DB
 * first, then — unless it was refreshed very recently — re-pulls the
 * settlement and its merchant funding transfer straight from Finix and
 * updates the DB before returning, so a missing/mis-scoped webhook row
 * never permanently strands a settlement showing UNKNOWN/no deposit.
 */
export async function loadSettlementDetail(finixSettlementId: string, churchId: string) {
  let settlement = await prisma.finixSettlement.findFirst({
    where: { finixSettlementId, churchId },
  });
  if (!settlement) return null;

  const staleEnoughToRefresh = isStaleEnoughToRefresh(settlement.lastSyncedAt);
  let hasFundingTransferData = true;
  if (staleEnoughToRefresh) {
    const refreshResult = await refreshSettlementAndDepositFromFinix(finixSettlementId, churchId, settlement.finixMerchantId);
    hasFundingTransferData = refreshResult.hasFundingTransferData;
    if (refreshResult.refreshed) {
      settlement = await prisma.finixSettlement.findFirst({ where: { finixSettlementId, churchId } });
      if (!settlement) return null;
    }
  }

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const transfers = await prisma.finixTransfer.findMany({
    where: { finixSettlementId, churchId },
    orderBy: { createdAtFinix: "desc" },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [payments, refunds, bankReturns, disputes, fees, deposit] = await Promise.all([
    transferIds.length
      ? prisma.payment.findMany({ where: { finixTransferId: { in: transferIds }, churchId } })
      : Promise.resolve([]),
    prisma.finixRefundOrReversal.findMany({ where: { finixSettlementId, churchId }, orderBy: { createdAtFinix: "desc" } }),
    transferIds.length
      ? prisma.bankReturn.findMany({ where: { originalTransferId: { in: transferIds }, churchId }, orderBy: { createdAtFinix: "desc" } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixDispute.findMany({ where: { finixTransferId: { in: transferIds }, churchId }, orderBy: { createdAtFinix: "desc" } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixFee.findMany({ where: { linkedToId: { in: transferIds }, churchId }, orderBy: { createdAtFinix: "desc" } })
      : Promise.resolve([]),
    // Confirmed real link: Finix's FUNDING_TRANSFER_ATTEMPT webhook payload
    // reports its own `settlement` field directly — this is not a WGC-side
    // inference, so no confidence/matching-reason system is needed here.
    prisma.finixFundingTransferAttempt.findFirst({
      where: { finixSettlementId, churchId },
      orderBy: { createdAtFinix: "desc" },
    }),
  ]);

  const donorIds = [...new Set(payments.map((p) => p.donorId).filter((id): id is string => !!id))];
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { id: { in: donorIds } } }) : [];
  const donorsById = new Map(donors.map((d) => [d.id, d]));

  const instrumentIds = [...new Set(payments.map((p) => p.finixPaymentInstrumentId).filter((id): id is string => !!id))];
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } })
    : [];
  const instrumentsById = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const paymentRows = payments.map((payment) => ({
    payment,
    donor: payment.donorId ? donorsById.get(payment.donorId) ?? null : null,
    instrument: payment.finixPaymentInstrumentId ? instrumentsById.get(payment.finixPaymentInstrumentId) ?? null : null,
    transfer: transfers.find((t) => t.finixTransferId === payment.finixTransferId) ?? null,
  }));

  // Enrich the deposit's bank display from the verified payout bank
  // account (Organization Profile's own source of truth) whenever the
  // funding-transfer row itself is missing bank name/type — matched via
  // the destination payment-instrument id, never by guessing.
  let depositBankAccount: Awaited<ReturnType<typeof prisma.organizationBankAccount.findFirst>> | null = null;
  if (deposit?.destinationPaymentInstrumentId && (!deposit.bankName || !deposit.bankAccountType)) {
    depositBankAccount = await prisma.organizationBankAccount.findFirst({
      where: { churchId, finixPaymentInstrumentId: deposit.destinationPaymentInstrumentId },
    });
  }

  return { settlement, church, transfers, paymentRows, refunds, bankReturns, disputes, fees, deposit, depositBankAccount, hasFundingTransferData };
}

export type SettlementDetail = NonNullable<Awaited<ReturnType<typeof loadSettlementDetail>>>;
