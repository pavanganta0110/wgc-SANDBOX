export const SETTLEMENT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "created", label: "Created" },
  { key: "status", label: "Status" },
  { key: "grossAmount", label: "Gross Amount" },
  { key: "feeAmount", label: "Fee Amount" },
  { key: "refundAmount", label: "Refund Amount" },
  { key: "returnAmount", label: "Return Amount" },
  { key: "disputeAmount", label: "Dispute Amount" },
  { key: "otherAdjustmentAmount", label: "Other Adjustments" },
  { key: "netAmount", label: "Net Amount" },
  { key: "transactionCount", label: "Transactions" },
  { key: "depositStatus", label: "Deposit Status" },
  { key: "depositId", label: "Deposit ID" },
  { key: "reconciliationStatus", label: "Reconciliation" },
  { key: "traceId", label: "Trace ID" },
] as const;

export type SettlementColumnKey = (typeof SETTLEMENT_COLUMNS)[number]["key"];

export function parseVisibleSettlementColumns(colsParam: string | undefined): Set<SettlementColumnKey> {
  if (!colsParam) return new Set(SETTLEMENT_COLUMNS.map((c) => c.key));
  const requested = new Set(colsParam.split(","));
  return new Set(SETTLEMENT_COLUMNS.map((c) => c.key).filter((k) => requested.has(k)));
}
