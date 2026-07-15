import { prisma } from "@/lib/prisma";

/**
 * Batch-loads every dispute for a church plus its joined transfer/
 * instrument/donor/settlement/deposit in a fixed number of queries (one
 * per table, not one per dispute) — the same batch-join pattern used by
 * the Payments/Refunds/Bank-Returns list pages, avoiding N+1 lookups.
 */
export async function loadDisputesList(churchId: string, dateFilter?: { gte: Date; lte?: Date }) {
  const disputes = await prisma.finixDispute.findMany({
    where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    orderBy: { createdAtFinix: "desc" },
    take: 300,
  });

  const transferIds = disputes.map((d) => d.finixTransferId).filter((id): id is string => Boolean(id));
  const transfers = transferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: transferIds } } })
    : [];
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = transfers.map((t) => t.finixPaymentInstrumentId).filter((id): id is string => Boolean(id));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const donorIds = instruments.map((i) => i.donorId).filter((id): id is string => Boolean(id));
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { id: { in: donorIds } } }) : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const settlementIds = transfers.map((t) => t.finixSettlementId).filter((id): id is string => Boolean(id));
  const settlements = settlementIds.length
    ? await prisma.finixSettlement.findMany({ where: { finixSettlementId: { in: settlementIds } } })
    : [];
  const settlementMap = new Map(settlements.map((s) => [s.finixSettlementId, s]));

  const deposits = settlementIds.length
    ? await prisma.finixFundingTransferAttempt.findMany({ where: { finixSettlementId: { in: settlementIds } } })
    : [];
  const depositBySettlement = new Map(deposits.map((d) => [d.finixSettlementId, d]));

  return disputes.map((dispute) => {
    const transfer = dispute.finixTransferId ? transferMap.get(dispute.finixTransferId) ?? null : null;
    const instrument = transfer?.finixPaymentInstrumentId ? instrumentMap.get(transfer.finixPaymentInstrumentId) ?? null : null;
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) ?? null : null;
    const settlement = transfer?.finixSettlementId ? settlementMap.get(transfer.finixSettlementId) ?? null : null;
    const deposit = settlement ? depositBySettlement.get(settlement.finixSettlementId) ?? null : null;
    return { dispute, transfer, instrument, donor, settlement, deposit };
  });
}

export type DisputeListRow = Awaited<ReturnType<typeof loadDisputesList>>[number];
