export const REFUND_COLUMNS = [
  { key: "created", label: "Created" },
  { key: "organization", label: "Organization" },
  { key: "donor", label: "Donor" },
  { key: "amount", label: "Refund Amount" },
  { key: "state", label: "State" },
  { key: "originalPayment", label: "Original Payment" },
  { key: "instrument", label: "Payment Instrument" },
  { key: "instrumentType", label: "Instrument Type" },
  { key: "updated", label: "Updated" },
] as const;

export type RefundColumnKey = (typeof REFUND_COLUMNS)[number]["key"];

export function parseVisibleColumns(colsParam: string | undefined): Set<RefundColumnKey> {
  if (!colsParam) return new Set(REFUND_COLUMNS.map((c) => c.key));
  const requested = new Set(colsParam.split(","));
  return new Set(REFUND_COLUMNS.map((c) => c.key).filter((k) => requested.has(k)));
}
