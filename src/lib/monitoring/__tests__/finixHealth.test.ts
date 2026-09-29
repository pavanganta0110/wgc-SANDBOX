import { describe, it, expect, vi, beforeEach } from "vitest";

const recordHealthEvent = vi.fn().mockResolvedValue({ eventId: "e1", wgcReference: "WGC-ABC123" });
vi.mock("../healthEvents", () => ({ recordHealthEvent: (...args: unknown[]) => recordHealthEvent(...args) }));

import { recordFinixTechnicalFailure, normalizeFinixOperation, extractFinixErrorCode } from "../finixHealth";

beforeEach(() => vi.clearAllMocks());

describe("normalizeFinixOperation", () => {
  it("strips a long id-like segment down to :id", () => {
    expect(normalizeFinixOperation("/transfers/TR4a9f8e2c1b3d4e5f/reversals")).toBe("/transfers/:id/reversals");
  });

  it("leaves short, non-id segments alone", () => {
    expect(normalizeFinixOperation("/transfers")).toBe("/transfers");
    expect(normalizeFinixOperation("/fee_profiles")).toBe("/fee_profiles");
  });

  it("resolves an absolute URL down to just its path", () => {
    expect(normalizeFinixOperation("https://finix.sandbox-payments-api.com/settlements/STabcdef1234567890")).toBe("/settlements/:id");
  });

  it("strips a query string", () => {
    expect(normalizeFinixOperation("/transfers?merchant=MUabcdefghij1234")).toBe("/transfers");
  });
});

describe("extractFinixErrorCode", () => {
  it("extracts the first embedded error code when present", () => {
    expect(extractFinixErrorCode({ _embedded: { errors: [{ code: "INVALID_FIELD" }] } })).toBe("INVALID_FIELD");
  });

  it("returns undefined for an unexpected shape rather than throwing", () => {
    expect(extractFinixErrorCode("not an object")).toBeUndefined();
    expect(extractFinixErrorCode(null)).toBeUndefined();
    expect(extractFinixErrorCode({})).toBeUndefined();
  });
});

describe("recordFinixTechnicalFailure", () => {
  it("records a technical Finix failure with service=Finix and the given requestId", () => {
    recordFinixTechnicalFailure({ path: "/transfers", method: "POST", httpStatus: 500, kind: "SERVER_ERROR", message: "boom", requestId: "req_abc" });
    expect(recordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ service: "Finix", integration: "finix", requestId: "req_abc", status: "FAILED" })
    );
  });

  it("classifies AUTH_FAILURE and SERVER_ERROR as CRITICAL", () => {
    recordFinixTechnicalFailure({ path: "/transfers", method: "GET", httpStatus: 401, kind: "AUTH_FAILURE", message: "unauthorized", requestId: "req_1" });
    recordFinixTechnicalFailure({ path: "/transfers", method: "GET", httpStatus: 500, kind: "SERVER_ERROR", message: "server error", requestId: "req_2" });
    expect(recordHealthEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ severity: "CRITICAL" }));
    expect(recordHealthEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ severity: "CRITICAL" }));
  });

  it("classifies RATE_LIMITED as WARNING, not an infrastructure-incident severity", () => {
    recordFinixTechnicalFailure({ path: "/transfers", method: "POST", httpStatus: 429, kind: "RATE_LIMITED", message: "rate limited", requestId: "req_3" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING" }));
  });

  it("classifies TIMEOUT/NETWORK_ERROR/CLIENT_ERROR/MALFORMED_RESPONSE as ERROR", () => {
    for (const kind of ["TIMEOUT", "NETWORK_ERROR", "CLIENT_ERROR", "MALFORMED_RESPONSE"] as const) {
      recordFinixTechnicalFailure({ path: "/transfers", method: "GET", httpStatus: null, kind, message: "x", requestId: "req_x" });
    }
    for (const call of recordHealthEvent.mock.calls) {
      expect(call[0].severity).toBe("ERROR");
    }
  });

  it("attaches merchant/request context when the underlying Finix call included it", () => {
    recordFinixTechnicalFailure({ path: "/transfers/TR12345678901234", method: "POST", httpStatus: 500, kind: "SERVER_ERROR", message: "boom", requestId: "req_abc", finixErrorCode: "SOME_CODE", durationMs: 1234, attempt: 2 });
    const call = recordHealthEvent.mock.calls[0][0];
    expect(call.operation).toBe("/transfers/:id");
    expect(call.metadata).toMatchObject({ finixErrorCode: "SOME_CODE", durationMs: 1234, attempt: 2 });
  });

  it("never throws even if recordHealthEvent rejects", () => {
    recordHealthEvent.mockRejectedValueOnce(new Error("db down"));
    expect(() => recordFinixTechnicalFailure({ path: "/transfers", method: "POST", httpStatus: 500, kind: "SERVER_ERROR", message: "boom", requestId: "req_abc" })).not.toThrow();
  });
});
