import { describe, it, expect } from "vitest";
import { groupSubscriptionsByDonor, type SubscriptionRow } from "@/lib/subscriptions/subscriptionAggregates";

function makeRow(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "sub-1",
    finixSubscriptionId: "fx-sub-1",
    churchId: "church-A",
    donorId: "D1",
    donorName: "Jane Doe",
    donorEmail: "jane@example.com",
    donorPhone: null,
    amountCents: 5000,
    currency: "USD",
    billingInterval: "MONTHLY",
    monthlyValueCents: 5000,
    displayStatus: "ACTIVE",
    startDate: new Date("2026-01-01"),
    nextBillingDate: new Date("2026-08-01"),
    endDate: null,
    canceledAt: null,
    completedAt: null,
    lastPayment: null,
    lastFailure: null,
    paymentMethod: null,
    givingLinkId: null,
    givingLinkName: null,
    fundId: null,
    fundName: null,
    failedAttempts: 0,
    lifetimeCollectedCents: 5000,
    requiresAttention: false,
    attentionReasons: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("groupSubscriptionsByDonor", () => {
  it("a donor with three subscriptions appears exactly once", () => {
    const rows = [
      makeRow({ id: "sub-1", finixSubscriptionId: "fx-1" }),
      makeRow({ id: "sub-2", finixSubscriptionId: "fx-2" }),
      makeRow({ id: "sub-3", finixSubscriptionId: "fx-3" }),
    ];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors).toHaveLength(1);
    expect(donors[0].totalSubscriptionCount).toBe(3);
    expect(donors[0].activeSubscriptionCount).toBe(3);
  });

  it("excludes a subscription with no resolvable donor from the Recurring Donors view", () => {
    const rows = [makeRow({ donorId: null })];
    expect(groupSubscriptionsByDonor(rows)).toHaveLength(0);
  });

  it("sums monthlyValueCents only across active subscriptions", () => {
    const rows = [
      makeRow({ id: "sub-1", monthlyValueCents: 5000, displayStatus: "ACTIVE" }),
      makeRow({ id: "sub-2", monthlyValueCents: 0, displayStatus: "CANCELED" }),
    ];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors[0].monthlyValueCents).toBe(5000);
    expect(donors[0].annualizedValueCents).toBe(60000);
  });

  it("counts past-due subscriptions and marks overall status MIXED", () => {
    const rows = [
      makeRow({ id: "sub-1", displayStatus: "ACTIVE" }),
      makeRow({ id: "sub-2", displayStatus: "PAST_DUE", monthlyValueCents: 0 }),
    ];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors[0].pastDueSubscriptionCount).toBe(1);
    expect(donors[0].overallStatus).toBe("MIXED");
  });

  it("takes the earliest confirmed next billing date among active subscriptions", () => {
    const rows = [
      makeRow({ id: "sub-1", nextBillingDate: new Date("2026-09-01") }),
      makeRow({ id: "sub-2", nextBillingDate: new Date("2026-08-01") }),
    ];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors[0].nextBillingDate?.toISOString()).toBe(new Date("2026-08-01").toISOString());
  });

  it("sums lifetimeRecurringDonatedCents across all subscriptions, including canceled ones", () => {
    const rows = [
      makeRow({ id: "sub-1", lifetimeCollectedCents: 5000, displayStatus: "ACTIVE" }),
      makeRow({ id: "sub-2", lifetimeCollectedCents: 3000, displayStatus: "CANCELED", monthlyValueCents: 0 }),
    ];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors[0].lifetimeRecurringDonatedCents).toBe(8000);
  });

  it("keeps two different donors as two separate rows", () => {
    const rows = [makeRow({ id: "sub-1", donorId: "D1" }), makeRow({ id: "sub-2", donorId: "D2", donorName: "John Doe" })];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors).toHaveLength(2);
  });

  it("aggregates requiresAttention and de-duplicates reasons across a donor's subscriptions", () => {
    const rows = [
      makeRow({ id: "sub-1", requiresAttention: true, attentionReasons: ["Expired payment method"] }),
      makeRow({ id: "sub-2", requiresAttention: true, attentionReasons: ["Expired payment method"] }),
    ];
    const donors = groupSubscriptionsByDonor(rows);
    expect(donors[0].requiresAttention).toBe(true);
    expect(donors[0].attentionReasons).toEqual(["Expired payment method"]);
  });
});
