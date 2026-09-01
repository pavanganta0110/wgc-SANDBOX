import { describe, it, expect } from "vitest";
import { classifyTokenEndpointError, classifyHttpStatus } from "../errors";

describe("classifyTokenEndpointError — OAuth token endpoint's error shape", () => {
  it("classifies invalid_grant specifically, as non-retryable, requiring reconnect", () => {
    const result = classifyTokenEndpointError(400, { error: "invalid_grant", error_description: "Token invalid" });
    expect(result.category).toBe("INVALID_GRANT");
    expect(result.retryable).toBe(false);
    expect(result.safeMessage).toMatch(/reconnect/i);
  });

  it("falls back to generic HTTP-status classification for any other OAuth error", () => {
    const result = classifyTokenEndpointError(400, { error: "invalid_request" });
    expect(result).toEqual(classifyHttpStatus(400));
    expect(result.category).not.toBe("INVALID_GRANT");
  });

  it("falls back to HTTP-status classification when the body isn't the expected shape at all", () => {
    expect(classifyTokenEndpointError(500, null)).toEqual(classifyHttpStatus(500));
    expect(classifyTokenEndpointError(500, "not an object")).toEqual(classifyHttpStatus(500));
  });
});
