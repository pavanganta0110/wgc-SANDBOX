import { describe, it, expect } from "vitest";
import { resolveBankAccountDisplayStatus } from "@/lib/organization/bankAccountStatus";

describe("resolveBankAccountDisplayStatus", () => {
  it("returns the explicit status when it's a recognized value", () => {
    expect(resolveBankAccountDisplayStatus({ status: "VERIFIED", isActiveDestination: false })).toBe("VERIFIED");
    expect(resolveBankAccountDisplayStatus({ status: "REQUIRES_ACTION", isActiveDestination: true })).toBe("REQUIRES_ACTION");
  });

  it("falls back to ACTIVE_FOR_FUTURE_PAYOUTS when isActiveDestination is true but status is unrecognized", () => {
    expect(resolveBankAccountDisplayStatus({ status: null, isActiveDestination: true })).toBe("ACTIVE_FOR_FUTURE_PAYOUTS");
    expect(resolveBankAccountDisplayStatus({ status: "SOMETHING_WEIRD", isActiveDestination: true })).toBe("ACTIVE_FOR_FUTURE_PAYOUTS");
  });

  it("still recognizes legacy ACTIVE/PENDING/VERIFYING statuses written before this rename", () => {
    expect(resolveBankAccountDisplayStatus({ status: "ACTIVE", isActiveDestination: true })).toBe("ACTIVE");
    expect(resolveBankAccountDisplayStatus({ status: "PENDING", isActiveDestination: false })).toBe("PENDING");
  });

  it("falls back to UNKNOWN when not active and status is unrecognized", () => {
    expect(resolveBankAccountDisplayStatus({ status: null, isActiveDestination: false })).toBe("UNKNOWN");
  });
});
