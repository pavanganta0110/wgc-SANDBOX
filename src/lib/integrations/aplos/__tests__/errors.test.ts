import { describe, it, expect } from "vitest";
import { classifyAplosExceptionCode, classifyNetworkOrTimeoutError } from "../errors";

describe("classifyAplosExceptionCode — every code from Aplos's documented catalog", () => {
  const cases: Array<[number, ReturnType<typeof classifyAplosExceptionCode>["category"], boolean]> = [
    [1001, "ACCESS_DENIED", false], // Client Disabled
    [1002, "AUTHENTICATION_REQUIRED", true], // Missing Token
    [1003, "ACCESS_DENIED", false], // Revoked Token
    [1004, "AUTHENTICATION_REQUIRED", true], // Expired Token
    [1005, "INVALID_CONFIGURATION", false], // Client Invalid
    [1006, "ACCESS_DENIED", false], // Client Unauthorized
    [3000, "ACCESS_DENIED", false],
    [3001, "INVALID_CONFIGURATION", false], // Not Available
    [3002, "VALIDATION_ERROR", false], // Missing Input
    [4000, "VALIDATION_ERROR", false],
    [4001, "VALIDATION_ERROR", false],
    [4002, "VALIDATION_ERROR", false],
    [4003, "VALIDATION_ERROR", false],
    [4004, "VALIDATION_ERROR", false],
    [4005, "RECONCILIATION_ERROR", false], // Lines Out of Balance
    [4006, "RECONCILIATION_ERROR", false], // Lines Do Not Sum
    [4007, "VALIDATION_ERROR", false],
    [4008, "INVALID_CONFIGURATION", false], // Date is in a closed period
    [5000, "TEMPORARY_APLOS_ERROR", true],
  ];

  for (const [code, expectedCategory, expectedRetryable] of cases) {
    it(`maps code ${code} to ${expectedCategory} (retryable: ${expectedRetryable})`, () => {
      const result = classifyAplosExceptionCode(code);
      expect(result.category).toBe(expectedCategory);
      expect(result.retryable).toBe(expectedRetryable);
      expect(result.aplosExceptionCode).toBe(code);
    });
  }

  it("maps an undocumented code to UNKNOWN_ERROR rather than guessing a category", () => {
    const result = classifyAplosExceptionCode(9999);
    expect(result.category).toBe("UNKNOWN_ERROR");
    expect(result.retryable).toBe(false);
  });

  it("treats an undocumented code paired with HTTP 429 as RATE_LIMITED (inferred, not documented by Aplos)", () => {
    const result = classifyAplosExceptionCode(9999, 429);
    expect(result.category).toBe("RATE_LIMITED");
    expect(result.retryable).toBe(true);
  });

  it("never puts a raw/unsafe message in safeMessage", () => {
    const result = classifyAplosExceptionCode(4005);
    expect(result.safeMessage.length).toBeGreaterThan(0);
    expect(result.safeMessage).not.toMatch(/exception|stack|trace/i);
  });
});

describe("classifyNetworkOrTimeoutError", () => {
  it("treats a write-path timeout as AMBIGUOUS_RESULT, never automatically retryable", () => {
    const result = classifyNetworkOrTimeoutError("TIMEOUT");
    expect(result.category).toBe("AMBIGUOUS_RESULT");
    expect(result.retryable).toBe(false);
  });

  it("treats a network error as a retryable temporary failure", () => {
    const result = classifyNetworkOrTimeoutError("NETWORK_ERROR");
    expect(result.category).toBe("TEMPORARY_APLOS_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("treats a malformed response as a non-retryable unknown error", () => {
    const result = classifyNetworkOrTimeoutError("MALFORMED_RESPONSE");
    expect(result.category).toBe("UNKNOWN_ERROR");
    expect(result.retryable).toBe(false);
  });
});
