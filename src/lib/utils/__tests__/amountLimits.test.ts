import { describe, it, expect } from "vitest";
import { goalAmountCentsError, POSTGRES_INT4_MAX } from "../amountLimits";

describe("goalAmountCentsError", () => {
  it("accepts nothing, zero and ordinary goals", () => {
    for (const v of [undefined, null, 0, 100, 500_000_00, POSTGRES_INT4_MAX]) expect(goalAmountCentsError(v)).toBeNull();
  });

  it("refuses the amount that crashed a pledge campaign ($32,000,000) with a clear message instead of a 500", () => {
    expect(goalAmountCentsError(3_200_000_000)).toMatch(/too large.*\$21,474,836\.47/);
  });

  it("refuses negatives, fractions, non-numbers and NaN/Infinity", () => {
    for (const v of [-1, 1.5, "100", NaN, Infinity, {}, true]) expect(goalAmountCentsError(v)).toMatch(/valid, non-negative/);
  });

  it("uses the label it's given", () => {
    expect(goalAmountCentsError(3_200_000_000, "Team goal")).toMatch(/^Team goal is too large/);
  });
});
