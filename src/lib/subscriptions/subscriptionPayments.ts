import { prisma } from "@/lib/prisma";

/** Payments belonging to the exact subscription only — filtered by the verified FinixTransfer.finixSubscriptionId link, never by donor or payment instrument (which would pull in the donor's other, unrelated payments). */
export async function loadPaymentsForSubscription(finixSubscriptionId: string, churchId: string, page: number, pageSize: number) {
  const where = { churchId, finixSubscriptionId };

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
