import { describe, it, expect } from "vitest";
import { isStaleEnoughToRefresh, LIVE_REFRESH_THROTTLE_MS } from "@/lib/finix/sync/settlementFundingSync";

describe("isStaleEnoughToRefresh", () => {
  it("is stale when never synced", () => {
    expect(isStaleEnoughToRefresh(null)).toBe(true);
    expect(isStaleEnoughToRefresh(undefined)).toBe(true);
  });

  it("is not stale immediately after a sync", () => {
    expect(isStaleEnoughToRefresh(new Date())).toBe(false);
  });

  it("is stale once older than the throttle window", () => {
    const old = new Date(Date.now() - LIVE_REFRESH_THROTTLE_MS - 1000);
    expect(isStaleEnoughToRefresh(old)).toBe(true);
  });

  it("is not stale just inside the throttle window", () => {
    const recent = new Date(Date.now() - (LIVE_REFRESH_THROTTLE_MS - 5000));
    expect(isStaleEnoughToRefresh(recent)).toBe(false);
  });
});
