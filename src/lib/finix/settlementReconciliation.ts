export interface ReconciliationInput {
  totalAmountCents: number | null;
  netAmountCents: number | null;
  feeAmountCents: number | null;
  refundAmountCents: number | null;
  returnAmountCents: number | null;
  disputeAmountCents: number | null;
}

/**
 * Compares Finix's own reported net against what WGC independently derives
 * from the settlement's linked records — computed fresh on every read, not
 * stored, so it can never drift from the underlying data. The persisted
 * reconciliationStatus only ever changes on an explicit wgc_admin action.
 */
export function computeReconciliation(settlement: ReconciliationInput) {
  const gross = settlement.totalAmountCents ?? 0;
  const fees = settlement.feeAmountCents ?? 0;
  const refunds = settlement.refundAmountCents ?? 0;
  const returns = settlement.returnAmountCents ?? 0;
  const disputes = settlement.disputeAmountCents ?? 0;

  const calculatedNetCents = gross - fees - refunds - returns - disputes;
  const processorNetCents = settlement.netAmountCents;
  const differenceCents = processorNetCents != null ? calculatedNetCents - processorNetCents : null;

  return { calculatedNetCents, processorNetCents, differenceCents };
}
