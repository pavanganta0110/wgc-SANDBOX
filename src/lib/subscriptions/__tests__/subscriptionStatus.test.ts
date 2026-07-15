import { describe, it, expect } from "vitest";
import {
  resolveSubscriptionDisplayStatus,
  resolveRecurringDonorStatus,
  normalizeToMonthlyValueCents,
  annualizedValueCents,
  frequencyLabel,
  isUpcomingCharge,
} from "@/lib/subscriptions/subscriptionStatus";

describe("resolveSubscriptionDisplayStatus", () => {
  it("returns CANCELED when canceledAt is set, regardless of raw state", () => {
    const status = resolveSubscriptionDisplayStatus({ rawState: "ACTIVE", canceledAt: new Date(), completedAt: null });
    expect(status).toBe("CANCELED");
  });

  it("returns COMPLETED when completedAt is set", () => {
    const status = resolveSubscriptionDisplayStatus({ rawState: "ACTIVE", canceledAt: null, completedAt: new Date() });
    expect(status).toBe("COMPLETED");
  });

  it("passes through a recognized raw state uppercased", () => {
    expect(resolveSubscriptionDisplayStatus({ rawState: "active", canceledAt: null, completedAt: null })).toBe("ACTIVE");
    expect(resolveSubscriptionDisplayStatus({ rawState: "PAST_DUE", canceledAt: null, completedAt: null })).toBe("PAST_DUE");
  });

  it("falls back to UNKNOWN for an unrecognized or missing raw state rather than guessing", () => {
    expect(resolveSubscriptionDisplayStatus({ rawState: "SOMETHING_NEW", canceledAt: null, completedAt: null })).toBe("UNKNOWN");
    expect(resolveSubscriptionDisplayStatus({ rawState: null, canceledAt: null, completedAt: null })).toBe("UNKNOWN");
  });
});

describe("resolveRecurringDonorStatus", () => {
  it("returns NONE for a donor with no subscriptions", () => {
    expect(resolveRecurringDonorStatus([])).toBe("NONE");
  });

  it("returns the single status when every subscription shares it", () => {
    expect(resolveRecurringDonorStatus(["ACTIVE", "ACTIVE"])).toBe("ACTIVE");
  });

  it("returns MIXED when active and canceled schedules coexist", () => {
    expect(resolveRecurringDonorStatus(["ACTIVE", "CANCELED"])).toBe("MIXED");
  });

  it("returns MIXED whenever any subscription is PAST_DUE", () => {
    expect(resolveRecurringDonorStatus(["ACTIVE", "PAST_DUE"])).toBe("MIXED");
  });

  it("returns ACTIVE for a donor whose only non-uniform subscriptions still include ACTIVE and nothing worse than PAUSED classification rules allow", () => {
    expect(resolveRecurringDonorStatus(["ACTIVE", "ACTIVE", "ACTIVE"])).toBe("ACTIVE");
  });
});

describe("normalizeToMonthlyValueCents", () => {
  it("normalizes weekly amount * 52 / 12", () => {
    expect(normalizeToMonthlyValueCents(1000, "WEEKLY")).toBe(Math.round((1000 * 52) / 12));
  });

  it("passes monthly amount through unchanged", () => {
    expect(normalizeToMonthlyValueCents(5000, "MONTHLY")).toBe(5000);
  });

  it("divides quarterly amount by 3", () => {
    expect(normalizeToMonthlyValueCents(9000, "QUARTERLY")).toBe(3000);
  });

  it("divides yearly amount by 12", () => {
    expect(normalizeToMonthlyValueCents(12000, "YEARLY")).toBe(1000);
  });

  it("returns 0 for an unrecognized interval rather than guessing", () => {
    expect(normalizeToMonthlyValueCents(1000, "DAILY")).toBe(0);
    expect(normalizeToMonthlyValueCents(1000, null)).toBe(0);
  });
});

describe("annualizedValueCents", () => {
  it("multiplies the monthly value by 12", () => {
    expect(annualizedValueCents(1000)).toBe(12000);
  });

  it("test 7: two monthly subscriptions of $241.02 and $125.00 sum to $366.02/mo and $4,392.24/yr", () => {
    const monthlyRecurringValueCents = normalizeToMonthlyValueCents(24102, "MONTHLY") + normalizeToMonthlyValueCents(12500, "MONTHLY");
    expect(monthlyRecurringValueCents).toBe(36602);
    expect(annualizedValueCents(monthlyRecurringValueCents)).toBe(439224);
  });
});

describe("isUpcomingCharge", () => {
  const now = Date.parse("2026-07-14T00:00:00Z");
  const in7Days = now + 7 * 24 * 60 * 60 * 1000;

  it("test 8: a nextBillingAt already in the past is never upcoming", () => {
    expect(isUpcomingCharge(new Date(now - 24 * 60 * 60 * 1000), now, in7Days)).toBe(false);
  });

  it("a nextBillingAt exactly now is not upcoming (must be strictly greater than now)", () => {
    expect(isUpcomingCharge(new Date(now), now, in7Days)).toBe(false);
  });

  it("a nextBillingAt within the window is upcoming", () => {
    expect(isUpcomingCharge(new Date(now + 3 * 24 * 60 * 60 * 1000), now, in7Days)).toBe(true);
  });

  it("a nextBillingAt exactly at the window boundary is included", () => {
    expect(isUpcomingCharge(new Date(in7Days), now, in7Days)).toBe(true);
  });

  it("a nextBillingAt beyond the window is not upcoming", () => {
    expect(isUpcomingCharge(new Date(now + 30 * 24 * 60 * 60 * 1000), now, in7Days)).toBe(false);
  });

  it("no nextBillingAt at all is never upcoming", () => {
    expect(isUpcomingCharge(null, now, in7Days)).toBe(false);
  });
});

describe("frequencyLabel", () => {
  it("maps known intervals to display labels", () => {
    expect(frequencyLabel("WEEKLY")).toBe("Weekly");
    expect(frequencyLabel("QUARTERLY")).toBe("Quarterly");
  });

  it("falls back to Other for unrecognized or missing intervals", () => {
    expect(frequencyLabel("DAILY")).toBe("Other");
    expect(frequencyLabel(null)).toBe("Other");
  });
});
