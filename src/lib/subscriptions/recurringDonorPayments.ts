import { prisma } from "@/lib/prisma";

/**
 * Only transfers with a verified finixSubscriptionId (exact attribution —
 * see FinixTransfer.finixSubscriptionId) are ever returned here. A transfer
 * whose subscription link is unconfirmed is never included, even if it
 * shares the donor's instrument or a subscription's amount — that would be
 * inference, not attribution.
 */
export async function loadRecurringPaymentsForDonor(instrumentIds: string[], churchId: string, page: number, pageSize: number) {
  if (instrumentIds.length === 0) return { rows: [], totalCount: 0 };

  const where = {
    churchId,
    finixPaymentInstrumentId: { in: instrumentIds },
    finixSubscriptionId: { not: null },
  };

  const [totalCount, transfers] = await Promise.all([
    prisma.finixTransfer.count({ where }),
    prisma.finixTransfer.findMany({
      where,
      orderBy: { createdAtFinix: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const transferIds = transfers.map((t) => t.finixTransferId);
  const [refunds, bankReturns, disputes] = await Promise.all([
    transferIds.length ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.finixDispute.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }) : Promise.resolve([]),
  ]);

  const refundedTransferIds = new Set(refunds.map((r) => r.finixOriginalTransferId).filter(Boolean));
  const returnedTransferIds = new Set(bankReturns.map((r) => r.originalTransferId).filter(Boolean));
  const disputedTransferIds = new Set(disputes.map((d) => d.finixTransferId).filter(Boolean));

  const rows = transfers.map((t) => ({
    transfer: t,
    refunded: refundedTransferIds.has(t.finixTransferId),
    achReturned: returnedTransferIds.has(t.finixTransferId),
    disputed: disputedTransferIds.has(t.finixTransferId),
  }));

  return { rows, totalCount };
}

/**
 * A transfer tagged createdVia === "SUBSCRIPTION" (Finix's own origin
 * signal) but with no verified finixSubscriptionId link has no confirmed
 * relationship to any specific schedule — surfaced separately, never
 * counted in confirmed recurring totals, per the mandatory attribution
 * rule. Only wgc_admin may reconcile these.
 */
export async function loadUnattributedRecurringCandidates(instrumentIds: string[], churchId: string) {
  if (instrumentIds.length === 0) return [];
  return prisma.finixTransfer.findMany({
    where: {
      churchId,
      finixPaymentInstrumentId: { in: instrumentIds },
      createdVia: "SUBSCRIPTION",
      finixSubscriptionId: null,
    },
    orderBy: { createdAtFinix: "desc" },
  });
}
