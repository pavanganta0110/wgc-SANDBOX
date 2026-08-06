import { describe, it, expect } from "vitest";
import { computeNextAttemptDelayMs, computeNextAttemptAt, MAX_AUTOMATIC_RETRY_ATTEMPTS } from "../retryPolicy";

describe("computeNextAttemptDelayMs", () => {
  it("starts at the 5-minute base delay for the first attempt", () => {
    expect(computeNextAttemptDelayMs(1)).toBe(5 * 60 * 1000);
  });

  it("doubles for each subsequent attempt", () => {
    expect(computeNextAttemptDelayMs(2)).toBe(10 * 60 * 1000);
    expect(computeNextAttemptDelayMs(3)).toBe(20 * 60 * 1000);
  });

  it("caps at 6 hours no matter how many attempts", () => {
    expect(computeNextAttemptDelayMs(20)).toBe(6 * 60 * 60 * 1000);
  });

  it("never returns a negative or zero delay for attemptCount 0", () => {
    expect(computeNextAttemptDelayMs(0)).toBe(5 * 60 * 1000);
  });
});

describe("computeNextAttemptAt", () => {
  it("adds the computed delay to the given base time", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");
    const next = computeNextAttemptAt(1, now);
    expect(next.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });
});

describe("MAX_AUTOMATIC_RETRY_ATTEMPTS", () => {
  it("is a small, finite bound (never infinite automatic retries)", () => {
    expect(MAX_AUTOMATIC_RETRY_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_AUTOMATIC_RETRY_ATTEMPTS).toBeLessThan(20);
  });
});
