import type { SettlementDetail } from "@/lib/finix/settlementDetail";
import type { TimelineEvent } from "@/components/merchant/detail/TransactionTimeline";

/**
 * Builds the settlement lifecycle timeline from real, already-recorded data
 * only. "Transactions Added" and "Fees Calculated" are only shown when the
 * settlement actually has linked transfers/fees — a settlement with zero
 * transactions synced so far won't show a fabricated step for either.
 */
export function buildSettlementTimeline(detail: SettlementDetail): TimelineEvent[] {
  const { settlement, transfers, fees, deposit } = detail;
  const events: TimelineEvent[] = [];

  if (settlement.accruedAt || settlement.createdAtFinix) {
    events.push({ label: "Settlement Created", date: settlement.accruedAt ?? settlement.createdAtFinix });
  }
  if (transfers.length > 0) {
    events.push({ label: "Transactions Added", sublabel: `${transfers.length} transaction${transfers.length === 1 ? "" : "s"}`, date: settlement.accruedAt ?? settlement.createdAtFinix });
  }
  if (fees.length > 0) {
    events.push({ label: "Fees Calculated", sublabel: `${fees.length} fee${fees.length === 1 ? "" : "s"}`, date: settlement.accruedAt ?? settlement.createdAtFinix });
  }
  if ((settlement.refundAmountCents ?? 0) > 0 || (settlement.disputeAmountCents ?? 0) > 0 || (settlement.returnAmountCents ?? 0) > 0) {
    events.push({ label: "Adjustments Applied", date: settlement.accruedAt ?? settlement.createdAtFinix });
  }
  if (settlement.settledAt) {
    events.push({ label: "Settlement Finalized", date: settlement.settledAt });
  }
  if (deposit?.createdAtFinix) {
    events.push({ label: "Deposit Scheduled", date: deposit.createdAtFinix });
  }
  if (deposit?.sentAt) {
    events.push({ label: "Deposit Sent", date: deposit.sentAt });
  }
  if (deposit?.arrivedAt) {
    events.push({ label: "Deposit Completed", date: deposit.arrivedAt });
  }

  return events
    .filter((e) => e.date !== null && e.date !== undefined)
    .sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime());
}
