import { describe, it, expect, vi, beforeEach } from "vitest";

const recordHealthEvent = vi.fn().mockResolvedValue({ eventId: "e1", wgcReference: "WGC-ABC123" });
vi.mock("../healthEvents", () => ({ recordHealthEvent: (...args: unknown[]) => recordHealthEvent(...args) }));

import { recordAplosSyncOutcome } from "../aplosHealth";

beforeEach(() => vi.clearAllMocks());

describe("recordAplosSyncOutcome", () => {
  it("records a FAILED outcome as service=Aplos with the church as merchantId", () => {
    recordAplosSyncOutcome({ outcome: "FAILED", churchId: "church_1", syncRecordId: "sync_1", finixSettlementId: "settlement_1", category: "TEMPORARY_APLOS_ERROR", safeMessage: "Aplos had a temporary error" });
    expect(recordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ service: "Aplos", integration: "aplos", merchantId: "church_1", externalId: "sync_1", severity: "ERROR" })
    );
  });

  it("records a NEEDS_REVIEW outcome at ERROR severity regardless of category", () => {
    recordAplosSyncOutcome({ outcome: "NEEDS_REVIEW", churchId: "church_1", syncRecordId: "sync_1", finixSettlementId: "settlement_1", category: "AMBIGUOUS_RESULT", safeMessage: "needs review" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "ERROR" }));
  });

  it("records a FAILED outcome for a merchant-setup category (mapping/config) at WARNING, not ERROR", () => {
    recordAplosSyncOutcome({ outcome: "FAILED", churchId: "church_1", syncRecordId: "sync_1", finixSettlementId: "settlement_1", category: "MAPPING_REQUIRED", safeMessage: "fund not mapped" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING" }));
  });

  it("records a FAILED outcome for AUTHENTICATION_REQUIRED at ERROR — a real connection problem", () => {
    recordAplosSyncOutcome({ outcome: "FAILED", churchId: "church_1", syncRecordId: "sync_1", finixSettlementId: "settlement_1", category: "AUTHENTICATION_REQUIRED", safeMessage: "auth expired" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "ERROR" }));
  });

  it("never throws even if recordHealthEvent rejects", () => {
    recordHealthEvent.mockRejectedValueOnce(new Error("db down"));
    expect(() =>
      recordAplosSyncOutcome({ outcome: "FAILED", churchId: "church_1", syncRecordId: "sync_1", finixSettlementId: "settlement_1", category: "UNKNOWN_ERROR", safeMessage: "x" })
    ).not.toThrow();
  });
});
