import { describe, it, expect } from "vitest";
import { checkSetupLinkRateLimit } from "@/lib/subscriptions/setupLinkRateLimit";

describe("checkSetupLinkRateLimit", () => {
  it("allows the first several requests from a key within the limit", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkSetupLinkRateLimit(key)).toBe(true);
    }
  });

  it("rejects requests once the limit is exceeded within the window", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkSetupLinkRateLimit(key);
    expect(checkSetupLinkRateLimit(key)).toBe(false);
  });

  it("tracks distinct keys independently", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkSetupLinkRateLimit(keyA);
    expect(checkSetupLinkRateLimit(keyA)).toBe(false);
    expect(checkSetupLinkRateLimit(keyB)).toBe(true);
  });
});
