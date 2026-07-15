/**
 * Finix's subscriptions API (confirmed in src/lib/finix/client.ts) only
 * supports create/get/cancel — there is no pause/resume/update endpoint.
 * "PAUSED" is intentionally NOT one of our own triggerable states; it only
 * ever appears here if Finix itself reports it as a raw `state` value on a
 * synced subscription, which we pass through rather than suppress.
 */
export type SubscriptionDisplayStatus = "ACTIVE" | "PAUSED" | "PAST_DUE" | "CANCELED" | "COMPLETED" | "FAILED" | "PENDING" | "UNKNOWN";

const RECOGNIZED_RAW_STATES = new Set(["ACTIVE", "PAUSED", "PAST_DUE", "FAILED", "PENDING", "CANCELED", "COMPLETED"]);

/** Confirmed against docs.finix.com/guides/billing/subscriptions — the only billing_interval values Finix's subscriptions API accepts. "BIWEEKLY" is offered in the giving-link frequency picker but is NOT a valid Finix interval; never pass it to createSubscription. */
export const SUPPORTED_SUBSCRIPTION_FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type SubscriptionFrequency = (typeof SUPPORTED_SUBSCRIPTION_FREQUENCIES)[number];

export interface SubscriptionStatusInput {
  rawState: string | null;
  canceledAt: Date | null;
  completedAt: Date | null;
}

/** canceledAt/completedAt (real, webhook-populated columns) take priority over the raw processor state, since a cancellation confirmation can lag the state field in a given webhook payload. */
export function resolveSubscriptionDisplayStatus(input: SubscriptionStatusInput): SubscriptionDisplayStatus {
  if (input.canceledAt) return "CANCELED";
  if (input.completedAt) return "COMPLETED";
  const raw = (input.rawState || "").toUpperCase();
  if (RECOGNIZED_RAW_STATES.has(raw)) return raw as SubscriptionDisplayStatus;
  return "UNKNOWN";
}

/**
 * Donor-level aggregation across every subscription belonging to one donor.
 * MIXED is used whenever active and inactive-but-meaningful states coexist,
 * matching the "a donor with 3 subscriptions must appear once" requirement
 * without ever losing the fact that their situation is not uniform.
 */
export function resolveRecurringDonorStatus(subscriptionStatuses: SubscriptionDisplayStatus[]): SubscriptionDisplayStatus | "MIXED" | "NONE" {
  if (subscriptionStatuses.length === 0) return "NONE";
  const unique = new Set(subscriptionStatuses);
  if (unique.size === 1) return subscriptionStatuses[0];
  if (unique.has("PAST_DUE")) return "MIXED";
  if (unique.has("ACTIVE") && (unique.has("PAUSED") || unique.has("CANCELED") || unique.has("FAILED"))) return "MIXED";
  if (unique.has("ACTIVE")) return "ACTIVE";
  if (unique.has("PAUSED")) return "PAUSED";
  return "MIXED";
}

/** Normalizes any supported frequency's per-charge amount to a monthly value, per the definitions: Weekly*52/12, Monthly as-is, Quarterly/3, Yearly/12. */
export function normalizeToMonthlyValueCents(amountCents: number, billingInterval: string | null): number {
  switch ((billingInterval || "").toUpperCase()) {
    case "WEEKLY":
      return Math.round((amountCents * 52) / 12);
    case "EVERY_TWO_WEEKS":
    case "BIWEEKLY":
      return Math.round((amountCents * 26) / 12);
    case "MONTHLY":
      return amountCents;
    case "QUARTERLY":
      return Math.round(amountCents / 3);
    case "YEARLY":
      return Math.round(amountCents / 12);
    default:
      return 0;
  }
}

export function annualizedValueCents(monthlyValueCents: number): number {
  return monthlyValueCents * 12;
}

/** now < nextBillingAt <= windowEndMs — a date already in the past (stale or genuinely overdue) is never "upcoming", only a real future charge within the window counts. */
export function isUpcomingCharge(nextBillingDate: Date | null, nowMs: number, windowEndMs: number): boolean {
  if (!nextBillingDate) return false;
  const t = nextBillingDate.getTime();
  return t > nowMs && t <= windowEndMs;
}

export const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  EVERY_TWO_WEEKS: "Every Two Weeks",
  BIWEEKLY: "Every Two Weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export function frequencyLabel(billingInterval: string | null): string {
  if (!billingInterval) return "Other";
  return FREQUENCY_LABELS[billingInterval.toUpperCase()] || "Other";
}
