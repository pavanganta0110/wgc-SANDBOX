import { describe, it, expect, vi, beforeEach } from "vitest";

const recordHealthEvent = vi.fn().mockResolvedValue({ eventId: "e1", wgcReference: "WGC-ABC123" });
vi.mock("../healthEvents", () => ({ recordHealthEvent: (...args: unknown[]) => recordHealthEvent(...args) }));

import { classifyResendFailure, recordResendTechnicalFailure } from "../resendHealth";

beforeEach(() => vi.clearAllMocks());

describe("classifyResendFailure", () => {
  it("classifies a thrown exception (network/timeout) as technical", () => {
    expect(classifyResendFailure(new Error("fetch failed"), true)).toMatchObject({ kind: "NETWORK_ERROR" });
  });

  it("returns null (not technical) for a validation/request-shape error — an expected recipient/data outcome", () => {
    expect(classifyResendFailure({ name: "validation_error", message: "invalid" }, false)).toBeNull();
    expect(classifyResendFailure({ name: "invalid_to_address", message: "bad address" }, false)).toBeNull();
  });

  it("classifies an auth/API-key error as CRITICAL", () => {
    expect(classifyResendFailure({ name: "invalid_api_key", message: "bad key" }, false)).toMatchObject({ kind: "AUTH_FAILURE", severity: "CRITICAL" });
  });

  it("classifies a rate-limit error as WARNING", () => {
    expect(classifyResendFailure({ name: "rate_limit_exceeded", message: "slow down" }, false)).toMatchObject({ kind: "RATE_LIMITED", severity: "WARNING" });
  });

  it("classifies a provider 5xx-equivalent error as CRITICAL", () => {
    expect(classifyResendFailure({ name: "internal_server_error", message: "oops" }, false)).toMatchObject({ kind: "PROVIDER_ERROR", severity: "CRITICAL" });
  });

  it("defaults an unrecognized error name to technical/visible rather than silently dropping it", () => {
    expect(classifyResendFailure({ name: "some_future_error_name", message: "?" }, false)).toMatchObject({ kind: "UNKNOWN_TECHNICAL" });
  });
});

describe("recordResendTechnicalFailure", () => {
  it("does not call recordHealthEvent for a recipient/request-shape outcome", () => {
    recordResendTechnicalFailure({ error: { name: "invalid_to_address", message: "bad" }, wasException: false });
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  it("calls recordHealthEvent with service=Resend for a genuine provider issue", () => {
    recordResendTechnicalFailure({ error: { name: "internal_server_error", message: "oops" }, wasException: false, category: "DONATION_RECEIPT", churchId: "church_1" });
    expect(recordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ service: "Resend", integration: "resend", merchantId: "church_1", operation: "DONATION_RECEIPT" })
    );
  });
});
