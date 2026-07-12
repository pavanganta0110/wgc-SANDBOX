import { describe, it, expect } from "vitest";
import { resolveBankAccountDisplayStatus } from "@/lib/organization/bankAccountStatus";

describe("resolveBankAccountDisplayStatus", () => {
  it("returns the explicit status when it's a recognized value", () => {
    expect(resolveBankAccountDisplayStatus({ status: "VERIFIED", isActiveDestination: false })).toBe("VERIFIED");
    expect(resolveBankAccountDisplayStatus({ status: "REQUIRES_ACTION", isActiveDestination: true })).toBe("REQUIRES_ACTION");
  });

  it("falls back to ACTIVE when isActiveDestination is true but status is unrecognized", () => {
    expect(resolveBankAccountDisplayStatus({ status: null, isActiveDestination: true })).toBe("ACTIVE");
    expect(resolveBankAccountDisplayStatus({ status: "SOMETHING_WEIRD", isActiveDestination: true })).toBe("ACTIVE");
  });

  it("falls back to UNKNOWN when not active and status is unrecognized", () => {
    expect(resolveBankAccountDisplayStatus({ status: null, isActiveDestination: false })).toBe("UNKNOWN");
  });
});
