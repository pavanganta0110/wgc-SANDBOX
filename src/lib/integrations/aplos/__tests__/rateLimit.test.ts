import { describe, it, expect, beforeEach } from "vitest";
import { checkAplosConnectionRateLimit, __resetAplosConnectionRateLimitForTests } from "../rateLimit";

describe("checkAplosConnectionRateLimit", () => {
  beforeEach(() => {
    __resetAplosConnectionRateLimitForTests();
  });

  it("allows attempts under the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAplosConnectionRateLimit("church-1")).toBe(true);
    }
  });

  it("blocks the 6th attempt within the window", () => {
    for (let i = 0; i < 5; i++) checkAplosConnectionRateLimit("church-1");
    expect(checkAplosConnectionRateLimit("church-1")).toBe(false);
  });

  it("tracks each church independently", () => {
    for (let i = 0; i < 5; i++) checkAplosConnectionRateLimit("church-1");
    expect(checkAplosConnectionRateLimit("church-1")).toBe(false);
    expect(checkAplosConnectionRateLimit("church-2")).toBe(true);
  });
});
