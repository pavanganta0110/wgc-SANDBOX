export const BANK_RETURN_COLUMNS = [
  { key: "created", label: "Created" },
  { key: "organization", label: "Organization" },
  { key: "buyer", label: "Buyer" },
  { key: "amount", label: "Amount" },
  { key: "instrument", label: "Payment Instrument" },
  { key: "reason", label: "Reason Code" },
  { key: "updated", label: "Updated" },
] as const;

export type BankReturnColumnKey = (typeof BANK_RETURN_COLUMNS)[number]["key"];

export function parseVisibleBankReturnColumns(colsParam: string | undefined): Set<BankReturnColumnKey> {
  if (!colsParam) return new Set(BANK_RETURN_COLUMNS.map((c) => c.key));
  const requested = new Set(colsParam.split(","));
  return new Set(BANK_RETURN_COLUMNS.map((c) => c.key).filter((k) => requested.has(k)));
}
