import { describe, it, expect, vi, beforeEach } from "vitest";

const recordHealthEvent = vi.fn().mockResolvedValue({ eventId: "e1", wgcReference: "WGC-ABC123" });
vi.mock("../healthEvents", () => ({ recordHealthEvent: (...args: unknown[]) => recordHealthEvent(...args) }));

import { classifyTwilioFailure, recordTwilioTechnicalFailure, recordTwilioConfigMissing, isRecipientSpecificTwilioError } from "../twilioHealth";

beforeEach(() => vi.clearAllMocks());

describe("isRecipientSpecificTwilioError", () => {
  it("recognizes a known recipient-specific code (invalid number)", () => {
    expect(isRecipientSpecificTwilioError("21211")).toBe(true);
  });

  it("recognizes an opted-out recipient as recipient-specific", () => {
    expect(isRecipientSpecificTwilioError("21610")).toBe(true);
  });

  it("does not treat an unrecognized code as recipient-specific", () => {
    expect(isRecipientSpecificTwilioError("99999")).toBe(false);
  });

  it("handles null/undefined safely", () => {
    expect(isRecipientSpecificTwilioError(null)).toBe(false);
    expect(isRecipientSpecificTwilioError(undefined)).toBe(false);
  });
});

describe("classifyTwilioFailure", () => {
  it("returns null for a recipient-specific error code — not a Twilio problem", () => {
    expect(classifyTwilioFailure({ httpStatus: 400, twilioErrorCode: "21211", wasException: false })).toBeNull();
  });

  it("classifies a 401/403 as AUTH_FAILURE/CRITICAL", () => {
    expect(classifyTwilioFailure({ httpStatus: 401, wasException: false })).toMatchObject({ kind: "AUTH_FAILURE", severity: "CRITICAL" });
  });

  it("classifies a 5xx as PROVIDER_ERROR/CRITICAL", () => {
    expect(classifyTwilioFailure({ httpStatus: 500, wasException: false })).toMatchObject({ kind: "PROVIDER_ERROR", severity: "CRITICAL" });
  });

  it("classifies a 429 as RATE_LIMITED/WARNING", () => {
    expect(classifyTwilioFailure({ httpStatus: 429, wasException: false })).toMatchObject({ kind: "RATE_LIMITED", severity: "WARNING" });
  });

  it("classifies a thrown exception as NETWORK_ERROR", () => {
    expect(classifyTwilioFailure({ httpStatus: null, wasException: true })).toMatchObject({ kind: "NETWORK_ERROR" });
  });
});

describe("recordTwilioTechnicalFailure", () => {
  it("does not record a health event for a recipient-specific failure", () => {
    recordTwilioTechnicalFailure({ httpStatus: 400, twilioErrorCode: "21211", wasException: false, message: "invalid number" });
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  it("records service=Twilio for a genuine technical failure", () => {
    recordTwilioTechnicalFailure({ httpStatus: 500, wasException: false, message: "twilio 500" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ service: "Twilio", integration: "twilio" }));
  });
});

describe("recordTwilioConfigMissing", () => {
  it("records a CRITICAL config-missing event", () => {
    recordTwilioConfigMissing("auth_sms");
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ service: "Twilio", severity: "CRITICAL" }));
  });
});
