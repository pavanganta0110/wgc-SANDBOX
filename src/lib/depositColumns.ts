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

/**
 * Derives a funding-speed label from a Finix Transfer's operation_key —
 * per Finix's own API docs, the Transfer resource has no dedicated
 * "funding_speed" field (the code elsewhere that reads data.funding_speed/
 * data.ready_to_settle_upon is checking fields that don't exist on this
 * resource); operation_key values instead directly encode it, e.g.
 * INSTANT_MERCHANT_FUNDING_PUSH_TO_ACH vs
 * STANDARD_MERCHANT_FUNDING_PULL_FROM_ACH. NOT YET CONFIRMED against a
 * real synced payload for this account (this environment can't reach
 * Finix's API to check) — verify against an actual operation_key value
 * before relying on this in production. Returns null (never guesses) for
 * any operation_key that doesn't clearly indicate INSTANT or STANDARD.
 */
export function deriveFundingSpeedFromOperationKey(operationKey: string | null | undefined): string | null {
  if (!operationKey) return null;
  const key = operationKey.toUpperCase();
  // Order matters — check the more specific SAME_DAY case before the
  // broader INSTANT/STANDARD check, since Finix's enum includes
  // "...SAME_DAY_ACH..." variants under both instant and standard funding.
  if (key.includes("SAME_DAY")) return "SAME_DAY";
  if (key.includes("INSTANT")) return "INSTANT";
  if (key.includes("STANDARD")) return "STANDARD";
  return null;
}
