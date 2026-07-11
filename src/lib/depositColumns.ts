export const DEPOSIT_COLUMNS = [
  { key: "created", label: "Created" },
  { key: "organization", label: "Organization" },
  { key: "amount", label: "Deposit Amount" },
  { key: "bankAccount", label: "Bank Account" },
  { key: "state", label: "Deposit State" },
  { key: "fundingSpeed", label: "Funding Speed" },
  { key: "settlementCount", label: "Settlement Count" },
  { key: "paymentCount", label: "Payment Count" },
  { key: "netAmount", label: "Net Amount" },
  { key: "updated", label: "Updated" },
] as const;

export type DepositColumnKey = (typeof DEPOSIT_COLUMNS)[number]["key"];

export function parseVisibleDepositColumns(colsParam: string | undefined): Set<DepositColumnKey> {
  if (!colsParam) return new Set(DEPOSIT_COLUMNS.map((c) => c.key));
  const requested = new Set(colsParam.split(","));
  return new Set(DEPOSIT_COLUMNS.map((c) => c.key).filter((k) => requested.has(k)));
}

const FUNDING_SPEED_LABELS: Record<string, string> = {
  SAME_DAY: "Same Day",
  NEXT_DAY: "Next Day",
  STANDARD: "Standard",
  EXPRESS: "Express",
  DAILY: "Standard",
  PROCESSOR_WINDOW: "Standard",
};

export function formatFundingSpeed(fundingSpeed: string | null | undefined): string {
  if (!fundingSpeed) return "—";
  const key = fundingSpeed.toUpperCase().trim();
  return FUNDING_SPEED_LABELS[key] || key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
