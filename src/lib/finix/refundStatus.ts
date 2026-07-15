type RefundStatus = "NONE" | "PENDING" | "PARTIAL" | "FULL";

interface RefundStatusResult {
  refundedCents: number;
  refundStatus: RefundStatus;
  netAmountCents: number;
  /** What to show as the single primary state badge everywhere a payment is listed. */
  displayStatus: string;
}

/**
 * Computed on read from FinixTransfer + FinixRefundOrReversal — not stored
 * denormalized on the transfer row. Both source tables are already kept in
 * sync via webhooks/reconciliation, so recomputing here avoids adding a
 * second write path that can drift out of sync with them (the exact class
 * of bug this session kept finding and fixing).
 */
export function computeRefundStatus(
  transfer: { amountCents: number | null },
  refunds: { amountCents: number | null; state: string | null }[]
): RefundStatusResult {
  const amountCents = transfer.amountCents ?? 0;

  const succeededCents = refunds
    .filter((r) => (r.state || "").toUpperCase() === "SUCCEEDED")
    .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const hasPending = refunds.some((r) =>
    ["PENDING", "UNKNOWN"].includes((r.state || "").toUpperCase())
  );

  let refundStatus: RefundStatus = "NONE";
  if (succeededCents > 0 && succeededCents >= amountCents) refundStatus = "FULL";
  else if (succeededCents > 0) refundStatus = "PARTIAL";
  else if (hasPending) refundStatus = "PENDING";

  const netAmountCents = Math.max(amountCents - succeededCents, 0);

  const displayStatus =
    refundStatus === "FULL"
      ? "REFUNDED"
      : refundStatus === "PARTIAL"
        ? "PARTIALLY_REFUNDED"
        : refundStatus === "PENDING"
          ? "REFUND_PENDING"
          : null;

  return { refundedCents: succeededCents, refundStatus, netAmountCents, displayStatus: displayStatus ?? "" };
}

export function resolveDisplayStatus(transferState: string | null | undefined, refund: RefundStatusResult) {
  return refund.displayStatus || (transferState || "UNKNOWN").toUpperCase();
}
