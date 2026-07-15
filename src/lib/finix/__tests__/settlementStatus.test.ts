import { describe, it, expect } from "vitest";
import { normalizeSettlementStatus, resolveSettlementDisplayStatus, getSettlementStatusLabel, SETTLEMENT_UNKNOWN_STATUS } from "@/lib/finix/settlementStatus";

describe("normalizeSettlementStatus", () => {
  it("trusts a real Finix status even if it wasn't previously known — the actual bug being fixed", () => {
    expect(normalizeSettlementStatus("APPROVED")).toBe("APPROVED");
  });

  it("uppercases whatever Finix returned", () => {
    expect(normalizeSettlementStatus("approved")).toBe("APPROVED");
    expect(normalizeSettlementStatus("Pending")).toBe("PENDING");
  });

  it("falls back to UNKNOWN only when the value is truly missing", () => {
    expect(normalizeSettlementStatus(null)).toBe(SETTLEMENT_UNKNOWN_STATUS);
    expect(normalizeSettlementStatus(undefined)).toBe(SETTLEMENT_UNKNOWN_STATUS);
    expect(normalizeSettlementStatus("")).toBe(SETTLEMENT_UNKNOWN_STATUS);
  });

  it("never hardcodes a specific settlement's status — works for any value", () => {
    expect(normalizeSettlementStatus("SOME_FUTURE_FINIX_STATUS")).toBe("SOME_FUTURE_FINIX_STATUS");
  });
});

describe("resolveSettlementDisplayStatus", () => {
  it("reads processorState, not a hardcoded allowlist", () => {
    expect(resolveSettlementDisplayStatus({ processorState: "APPROVED" })).toBe("APPROVED");
    expect(resolveSettlementDisplayStatus({ processorState: "AWAITING_APPROVAL" })).toBe("AWAITING_APPROVAL");
  });

  it("returns UNKNOWN when processorState is null", () => {
    expect(resolveSettlementDisplayStatus({ processorState: null })).toBe("UNKNOWN");
  });

  it("matches the exact sandbox scenario: an APPROVED settlement must not display as UNKNOWN", () => {
    const settlement = { processorState: "APPROVED" };
    expect(resolveSettlementDisplayStatus(settlement)).toBe("APPROVED");
    expect(resolveSettlementDisplayStatus(settlement)).not.toBe("UNKNOWN");
  });
});

describe("getSettlementStatusLabel", () => {
  it("has a friendly label for APPROVED", () => {
    expect(getSettlementStatusLabel("APPROVED")).toBe("Approved");
  });

  it("title-cases an unrecognized status instead of showing it raw or blank", () => {
    expect(getSettlementStatusLabel("SOME_NEW_STATUS")).toBe("Some new status");
  });

  it("labels UNKNOWN distinctly", () => {
    expect(getSettlementStatusLabel("UNKNOWN")).toBe("Unknown");
  });
});
