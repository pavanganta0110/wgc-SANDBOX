import { describe, it, expect } from "vitest";
import { advancePayoutAccountStatus } from "@/lib/organization/bankAccountStatus";

describe("advancePayoutAccountStatus", () => {
  it("advances from SUBMITTED to VALIDATION_PENDING when the instrument is not yet enabled and has no disabled_code", () => {
    expect(advancePayoutAccountStatus("SUBMITTED", { enabled: false, disabled_code: null })).toBe("VALIDATION_PENDING");
  });

  it("advances to UNDER_REVIEW when already past validation but still not enabled", () => {
    expect(advancePayoutAccountStatus("VALIDATION_PENDING", { enabled: false, disabled_code: null })).toBe("UNDER_REVIEW");
    expect(advancePayoutAccountStatus("UNDER_REVIEW", { enabled: false, disabled_code: null })).toBe("UNDER_REVIEW");
  });

  it("advances to VERIFIED once the instrument reports enabled — but never further", () => {
    expect(advancePayoutAccountStatus("UNDER_REVIEW", { enabled: true, disabled_code: null })).toBe("VERIFIED");
    // VERIFIED must never auto-advance to ACTIVE_FOR_FUTURE_PAYOUTS — no
    // confirmed API exists to detect that transition, so it requires the
    // explicit exception-path activation instead.
    expect(advancePayoutAccountStatus("VERIFIED", { enabled: true, disabled_code: null })).toBe("VERIFIED");
  });

  it("moves to REQUIRES_ACTION when disabled with a recoverable disabled_code", () => {
    expect(advancePayoutAccountStatus("UNDER_REVIEW", { enabled: false, disabled_code: "UPDATE_REQUIRED" })).toBe("REQUIRES_ACTION");
  });

  it("moves to REJECTED when disabled_code indicates a terminal rejection", () => {
    expect(advancePayoutAccountStatus("UNDER_REVIEW", { enabled: false, disabled_code: "REJECTED" })).toBe("REJECTED");
    expect(advancePayoutAccountStatus("UNDER_REVIEW", { enabled: false, disabled_code: "DELETED" })).toBe("REJECTED");
  });

  it("never advances a terminal status, regardless of the instrument snapshot", () => {
    expect(advancePayoutAccountStatus("ACTIVE_FOR_FUTURE_PAYOUTS", { enabled: false, disabled_code: "DELETED" })).toBe("ACTIVE_FOR_FUTURE_PAYOUTS");
    expect(advancePayoutAccountStatus("REPLACED", { enabled: true, disabled_code: null })).toBe("REPLACED");
    expect(advancePayoutAccountStatus("REJECTED", { enabled: true, disabled_code: null })).toBe("REJECTED");
  });
});
