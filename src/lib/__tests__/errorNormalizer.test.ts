import { describe, it, expect, vi } from "vitest";
import {
  normalizeUserFacingError,
  redactSensitiveData,
  generateSupportReference,
} from "../utils/errorNormalizer";

describe("errorNormalizer", () => {
  it("should generate formatted support reference codes", () => {
    const ref = generateSupportReference();
    expect(ref).toMatch(/^WGC-[A-Z0-9]{6}$/);
  });

  it("should redact sensitive fields recursively from arbitrary payloads", () => {
    const sensitive = {
      card_number: "1234567812345678",
      nested: {
        cvv: "123",
        routing: "987654321",
        other: "safe value",
      },
      array: ["abc", { password: "secret_pass" }],
    };

    const redacted = redactSensitiveData(sensitive);
    expect(redacted.card_number).toBe("[REDACTED_SENSITIVE]");
    expect(redacted.nested.cvv).toBe("[REDACTED_SENSITIVE]");
    expect(redacted.nested.routing).toBe("[REDACTED_SENSITIVE]");
    expect(redacted.nested.other).toBe("safe value");
    expect(redacted.array[1].password).toBe("[REDACTED_SENSITIVE]");
  });

  it("should map wrong entity type error correctly", () => {
    const rawError = "Transfer Trn_123 have type != TRANSFER and can not be refunded";
    const normalized = normalizeUserFacingError(rawError);
    expect(normalized.title).toBe("Refund unavailable");
    expect(normalized.safeMessage).toBe("This transaction is not eligible for a refund.");
    expect(normalized.category).toBe("REFUND");
    expect(normalized.retryable).toBe(false);
  });

  it("should map already refunded errors", () => {
    const rawError = "This transfer has already been fully refunded";
    const normalized = normalizeUserFacingError(rawError);
    expect(normalized.title).toBe("Refund unavailable");
    expect(normalized.safeMessage).toBe("This payment has already been fully refunded.");
    expect(normalized.category).toBe("REFUND");
  });

  it("should map refund amount too large errors", () => {
    const rawError = "Refund amount exceeds refundable balance limit";
    const normalized = normalizeUserFacingError(rawError);
    expect(normalized.title).toBe("Check refund amount");
    expect(normalized.safeMessage).toBe("The refund amount cannot exceed the remaining refundable balance.");
    expect(normalized.category).toBe("REFUND");
  });

  it("should map permission failure errors", () => {
    const rawError = "Forbidden or unauthorized access";
    const normalized = normalizeUserFacingError(rawError);
    expect(normalized.title).toBe("Access denied");
    expect(normalized.safeMessage).toBe("You do not have permission to perform this action.");
    expect(normalized.category).toBe("PERMISSION");
  });

  it("should map tenant mismatch errors", () => {
    const rawError = "Entity could not be found or tenant mismatch occurred";
    const normalized = normalizeUserFacingError(rawError);
    expect(normalized.title).toBe("Record unavailable");
    expect(normalized.safeMessage).toBe("This record could not be found.");
    expect(normalized.category).toBe("SYSTEM");
  });

  it("should map rate limit errors", () => {
    const rawError = "HTTP 429 Too Many Requests";
    const normalized = normalizeUserFacingError(rawError);
    expect(normalized.title).toBe("Please wait");
    expect(normalized.safeMessage).toBe("Too many requests were made. Please try again shortly.");
    expect(normalized.category).toBe("SYSTEM");
    expect(normalized.retryable).toBe(true);
  });

  it("should generate support reference for unknown server errors", () => {
    const rawError = new Error("Database crashed unexpectedly!");
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    const normalized = normalizeUserFacingError(rawError);
    
    expect(normalized.title).toBe("Something went wrong");
    expect(normalized.safeMessage).toContain("WGC-");
    expect(normalized.supportReference).not.toBeNull();
    expect(logSpy).toHaveBeenCalled();
    
    logSpy.mockRestore();
  });
});
