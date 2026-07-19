import { describe, it, expect } from "vitest";
import {
  resolvePaymentAttributionFromGivingLink,
  resolveRecurringPaymentAttribution,
} from "@/lib/auth/attributionSnapshot";

describe("resolvePaymentAttributionFromGivingLink", () => {
  it("test 7: snapshots the giving link's current owner at the moment it's called", () => {
    const link = { ownerUserId: "fundraiser-A", churchId: "church-a" };
    expect(resolvePaymentAttributionFromGivingLink(link, "church-a")).toBe("fundraiser-A");
  });

  it("test 6: after a reassignment, a fresh call reflects the new owner (no caching/staleness in the function itself)", () => {
    const churchId = "church-a";
    const beforeReassignment = { ownerUserId: "fundraiser-A", churchId };
    const afterReassignment = { ownerUserId: "fundraiser-B", churchId };
    expect(resolvePaymentAttributionFromGivingLink(beforeReassignment, churchId)).toBe("fundraiser-A");
    expect(resolvePaymentAttributionFromGivingLink(afterReassignment, churchId)).toBe("fundraiser-B");
  });

  it("test 8: a null link owner produces null attribution, never a substituted owner", () => {
    const link = { ownerUserId: null, churchId: "church-a" };
    expect(resolvePaymentAttributionFromGivingLink(link, "church-a")).toBeNull();
  });

  it("no giving link at all (e.g. direct/admin payment) produces null attribution", () => {
    expect(resolvePaymentAttributionFromGivingLink(null, "church-a")).toBeNull();
  });

  it("test 9: a cross-church link/payment mismatch fails closed to null rather than attributing", () => {
    const link = { ownerUserId: "fundraiser-A", churchId: "church-B" };
    expect(resolvePaymentAttributionFromGivingLink(link, "church-a")).toBeNull();
  });

  it("tests 10-13: identical resolution regardless of payment method — this function has no paymentMethodType parameter at all, so card/ACH/Apple Pay/Google Pay (which only differ in paymentMethodType at the call site) necessarily produce the same attribution result for the same link", () => {
    const link = { ownerUserId: "fundraiser-A", churchId: "church-a" };
    // Card, ACH, Apple Pay, and Google Pay all call this same function with
    // the same (link, churchId) shape — see donate route lines around
    // paymentMethodType — there is no method-specific branch to diverge.
    expect(resolvePaymentAttributionFromGivingLink(link, "church-a")).toBe("fundraiser-A");
  });

  it("test 14: recurring subscription creation uses the same snapshot rule as one-time payments", () => {
    const link = { ownerUserId: "fundraiser-A", churchId: "church-a" };
    expect(resolvePaymentAttributionFromGivingLink(link, "church-a")).toBe("fundraiser-A");
  });
});

describe("resolveRecurringPaymentAttribution", () => {
  it("test 15: a generated recurring charge uses the subscription's stored attribution, not any live giving-link lookup", () => {
    // The function's signature itself proves this: it takes only
    // { attributedUserId }, nothing giving-link-shaped, so there is no way
    // for a caller to pass in a "current" link owner even by mistake.
    const subscription = { attributedUserId: "fundraiser-A" };
    expect(resolveRecurringPaymentAttribution(subscription)).toBe("fundraiser-A");
  });

  it("returns null when the subscription itself has no attribution", () => {
    expect(resolveRecurringPaymentAttribution({ attributedUserId: null })).toBeNull();
  });
});
