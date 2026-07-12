import { prisma } from "@/lib/prisma";

export interface PendingFundingSummary {
  accruingSettlements: number;
  processingSettlements: number;
  scheduledDeposits: number;
  processingDeposits: number;
  failedOrReturnedDeposits: number;
  hasAnyPending: boolean;
}

/** Used to warn before a bank-account change — never blocks the change, just informs. */
export async function checkPendingFunding(churchId: string): Promise<PendingFundingSummary> {
  const [accruingSettlements, processingSettlements, scheduledDeposits, processingDeposits, failedOrReturnedDeposits] = await Promise.all([
    prisma.finixSettlement.count({ where: { churchId, state: "ACCRUING" } }),
    prisma.finixSettlement.count({ where: { churchId, state: "READY" } }),
    prisma.finixFundingTransferAttempt.count({ where: { churchId, state: "PENDING" } }),
    prisma.finixFundingTransferAttempt.count({ where: { churchId, state: { in: ["PROCESSING", "SENT"] } } }),
    prisma.finixFundingTransferAttempt.count({ where: { churchId, state: { in: ["FAILED", "RETURNED"] } } }),
  ]);

  return {
    accruingSettlements,
    processingSettlements,
    scheduledDeposits,
    processingDeposits,
    failedOrReturnedDeposits,
    hasAnyPending: accruingSettlements + processingSettlements + scheduledDeposits + processingDeposits + failedOrReturnedDeposits > 0,
  };
}
