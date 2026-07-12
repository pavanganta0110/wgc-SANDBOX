import { describe, it, expect } from "vitest";
import { resolveVerificationState, resolvePaymentInstrumentState } from "@/lib/organization/bankAccountStatus";

describe("resolveVerificationState", () => {
  it("is NOT_STARTED for a freshly submitted account not yet enabled", () => {
    expect(resolveVerificationState({ enabled: false, disabled_code: null }, "SUBMITTED")).toBe("NOT_STARTED");
  });

  it("is PENDING once under review but not yet enabled", () => {
    expect(resolveVerificationState({ enabled: false, disabled_code: null }, "UNDER_REVIEW")).toBe("PENDING");
  });

  it("is VERIFIED once the instrument reports enabled, regardless of payoutDestinationState", () => {
    expect(resolveVerificationState({ enabled: true, disabled_code: null }, "UNDER_REVIEW")).toBe("VERIFIED");
    // Verified must never be conflated with active — payoutDestinationState
    // stays a completely separate field even when verification succeeds.
    expect(resolveVerificationState({ enabled: true, disabled_code: null }, "APPROVED")).toBe("VERIFIED");
  });

  it("is REJECTED for a terminal disabled_code", () => {
    expect(resolveVerificationState({ enabled: false, disabled_code: "REJECTED" }, "UNDER_REVIEW")).toBe("REJECTED");
    expect(resolveVerificationState({ enabled: false, disabled_code: "DELETED" }, "UNDER_REVIEW")).toBe("REJECTED");
  });
});

describe("resolvePaymentInstrumentState", () => {
  it("is ENABLED when the instrument reports enabled", () => {
    expect(resolvePaymentInstrumentState({ enabled: true, disabled_code: null })).toBe("ENABLED");
  });

  it("is DISABLED when not enabled but has a disabled_code", () => {
    expect(resolvePaymentInstrumentState({ enabled: false, disabled_code: "UPDATE_REQUIRED" })).toBe("DISABLED");
  });

  it("is PENDING when not enabled and no disabled_code yet", () => {
    expect(resolvePaymentInstrumentState({ enabled: false, disabled_code: null })).toBe("PENDING");
  });
});
