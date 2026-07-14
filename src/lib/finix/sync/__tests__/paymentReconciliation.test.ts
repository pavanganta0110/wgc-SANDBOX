import { describe, it, expect } from "vitest";
import { shouldApplyTransferState } from "@/lib/finix/sync/paymentReconciliation";

describe("shouldApplyTransferState", () => {
  it("test 11: applies SUCCEEDED over a currently-PENDING local state", () => {
    expect(shouldApplyTransferState("PENDING", "SUCCEEDED")).toBe(true);
  });

  it("test 13: a terminal SUCCEEDED state is never regressed by an older PENDING event", () => {
    expect(shouldApplyTransferState("SUCCEEDED", "PENDING")).toBe(false);
  });

  it("a terminal FAILED state is never regressed by a PENDING event", () => {
    expect(shouldApplyTransferState("FAILED", "PENDING")).toBe(false);
  });

  it("a terminal CANCELED state is never regressed by a PENDING event", () => {
    expect(shouldApplyTransferState("CANCELED", "PENDING")).toBe(false);
  });

  it("test 12: re-applying the exact same terminal state is a no-op, not an error", () => {
    expect(shouldApplyTransferState("SUCCEEDED", "SUCCEEDED")).toBe(true);
  });

  it("moving between two terminal states (e.g. a later dispute reversal) is still applied", () => {
    expect(shouldApplyTransferState("SUCCEEDED", "FAILED")).toBe(true);
  });

  it("normalizes case and treats a missing incoming state as PENDING", () => {
    expect(shouldApplyTransferState("pending", "succeeded")).toBe(true);
    expect(shouldApplyTransferState("SUCCEEDED", null)).toBe(false);
  });

  it("treats a missing local state as PENDING, so any real incoming state applies", () => {
    expect(shouldApplyTransferState(null, "SUCCEEDED")).toBe(true);
  });
});
