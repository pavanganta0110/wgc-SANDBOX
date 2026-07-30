/**
 * The financial snapshot for one payment within a settlement being
 * considered for Aplos sync. Every amount is preserved independently —
 * never silently combined — per the approved spec. All values are the
 * actual persisted cents fields; nothing here is recalculated from current
 * fee settings or estimated.
 */
export interface ContributionFinancialSnapshot {
  paymentId: string;
  finixTransferId: string;
  donorId: string | null;
  fundId: string | null;
  isAnonymous: boolean;

  /** Payment.donationAmountCents — the donation itself, excluding any
   * donor-covered fee. */
  donationAmountCents: number;
  /** Payment.feeCoveredCents — the additional amount the donor paid to
   * cover processing fees, if any. */
  feeCoveredCents: number;
  /** Payment.amountCents — total actually charged (donation + fee-covered). */
  totalChargedCents: number;
  /** Payment.actualFinixFeesCents — the real Finix/processor fee, populated
   * asynchronously by fee-sync; null until that sync completes. */
  processorFeeCents: number | null;
  /** FinixTransfer.applicationFeeCents — WGC's own application fee for this
   * transfer, per the approved decision (never derived from
   * percentageBps/fixedFeeCents). */
  applicationFeeCents: number | null;

  goodsServicesProvided: boolean;
  goodsServicesFairMarketValueCents: number | null;
}

export interface SettlementFinancialSnapshot {
  settlementId: string;
  finixSettlementId: string;
  churchId: string;
  state: string | null;

  totalAmountCents: number | null;
  netAmountCents: number | null;
  feeAmountCents: number | null;
  refundAmountCents: number | null;
  returnAmountCents: number | null;
  disputeAmountCents: number | null;
  otherAdjustmentAmountCents: number | null;

  payments: ContributionFinancialSnapshot[];
}
