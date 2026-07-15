export const DISPUTE_COLUMNS = [
  { key: "created", label: "Created" },
  { key: "updated", label: "Updated" },
  { key: "donor", label: "Donor" },
  { key: "paymentAmount", label: "Payment Amount" },
  { key: "disputedAmount", label: "Disputed Amount" },
  { key: "reason", label: "Reason" },
  { key: "displayStatus", label: "Status" },
  { key: "responseStatus", label: "Response Status" },
  { key: "evidenceDue", label: "Evidence Due" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "lastFour", label: "Last Four" },
  { key: "settlement", label: "Settlement" },
  { key: "deposit", label: "Deposit" },
] as const;

export type DisputeColumnKey = (typeof DISPUTE_COLUMNS)[number]["key"];

export function parseVisibleDisputeColumns(colsParam: string | undefined): Set<DisputeColumnKey> {
  if (!colsParam) return new Set(DISPUTE_COLUMNS.map((c) => c.key));
  const requested = new Set(colsParam.split(","));
  return new Set(DISPUTE_COLUMNS.map((c) => c.key).filter((k) => requested.has(k)));
}
