import { describe, it, expect } from "vitest";
import { renewalDesignationFromSubscription } from "../renewalDesignation";

describe("renewalDesignationFromSubscription", () => {
  it("carries the fund id and name snapshotted on the subscription", () => {
    expect(renewalDesignationFromSubscription({ fundId: "fund_1", fundName: "Summer Missions" })).toEqual({
      fundId: "fund_1",
      fundName: "Summer Missions",
    });
  });

  it("returns nulls for a subscription with no fund, never undefined", () => {
    expect(renewalDesignationFromSubscription({})).toEqual({ fundId: null, fundName: null });
    expect(renewalDesignationFromSubscription({ fundId: null, fundName: null })).toEqual({ fundId: null, fundName: null });
  });

  it("keeps the fund id and name independent of each other", () => {
    expect(renewalDesignationFromSubscription({ fundId: "fund_2" })).toEqual({ fundId: "fund_2", fundName: null });
  });
});
