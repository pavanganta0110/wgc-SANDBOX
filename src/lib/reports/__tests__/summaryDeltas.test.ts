import { describe, it, expect } from "vitest";
import {
  computeSummaryMetrics,
  computeSummaryNumbers,
  computeMetricDelta,
  formatMetricValue,
  METRIC_META,
  METRIC_LABELS,
  type SummaryInputs,
} from "@/lib/reports/summaryMetrics";

const inputs: SummaryInputs = {
  transfers: { totalCount: 12, succeededCount: 10, succeededVolumeCents: 123_456 },
  disputes: { totalCount: 2, activeCount: 1, totalVolumeCents: 8_500 },
  refunds: { totalCount: 3, totalVolumeCents: 4_000, succeededCount: 2, succeededVolumeCents: 2_500, failedCount: 1, failedVolumeCents: 1_500 },
  authorizations: { totalCount: 40, succeededCount: 35, requestedVolumeCents: 200_000, voidedCount: 2, voidedVolumeCents: 9_000 },
  deposits: { totalVolumeCents: 77_700 },
};

describe("computeSummaryNumbers / computeSummaryMetrics", () => {
  it("every labelled metric has numbers and metadata", () => {
    const nums = computeSummaryNumbers(inputs);
    for (const key of Object.keys(METRIC_LABELS)) {
      expect(nums).toHaveProperty(key);
      expect(METRIC_META).toHaveProperty(key);
    }
  });

  it("keeps the exact existing display formulas (pinned values)", () => {
    const m = computeSummaryMetrics(inputs);
    expect(m.totalTransactionVolume).toBe("$1,234.56");
    expect(m.avgTransactionAmount).toBe("$123.46"); // 123456 / 10 cents
    expect(m.disputeRate).toBe("16.7%"); // 2 disputes / 12 transfers
    expect(m.authorizationRate).toBe("87.5%");
    expect(m.totalTransactionCount).toBe("12");
    expect(m.totalDeposits).toBe("$777.00");
  });

  it("is just the numbers formatted", () => {
    const nums = computeSummaryNumbers(inputs);
    const m = computeSummaryMetrics(inputs);
    for (const key of Object.keys(nums)) {
      expect(m[key]).toBe(formatMetricValue(METRIC_META[key].kind, nums[key]));
    }
  });

  it("handles an empty account without NaN", () => {
    const empty: SummaryInputs = {
      transfers: { totalCount: 0, succeededCount: 0, succeededVolumeCents: 0 },
      disputes: { totalCount: 0, activeCount: 0, totalVolumeCents: 0 },
      refunds: { totalCount: 0, totalVolumeCents: 0, succeededCount: 0, succeededVolumeCents: 0, failedCount: 0, failedVolumeCents: 0 },
      authorizations: { totalCount: 0, succeededCount: 0, requestedVolumeCents: 0, voidedCount: 0, voidedVolumeCents: 0 },
      deposits: { totalVolumeCents: 0 },
    };
    const m = computeSummaryMetrics(empty);
    expect(m.avgTransactionAmount).toBe("$0.00");
    expect(m.disputeRate).toBe("0.0%");
    expect(m.authorizationRate).toBe("0.0%");
  });
});

describe("computeMetricDelta", () => {
  it("shows no pill without a previous period", () => {
    expect(computeMetricDelta("cents", "good", 100, null).direction).toBe("none");
  });

  it("shows no pill when both periods are zero", () => {
    expect(computeMetricDelta("cents", "good", 0, 0).direction).toBe("none");
  });

  it("computes relative % change with a sign and arrow direction", () => {
    expect(computeMetricDelta("cents", "good", 150, 100)).toEqual({ direction: "up", label: "+50.0%", tone: "good" });
    expect(computeMetricDelta("cents", "good", 50, 100)).toEqual({ direction: "down", label: "−50.0%", tone: "bad" });
  });

  it("colours by meaning: more disputes is bad, fewer is good", () => {
    expect(computeMetricDelta("count", "bad", 4, 2).tone).toBe("bad");
    expect(computeMetricDelta("count", "bad", 1, 2).tone).toBe("good");
  });

  it("never colours neutral metrics good or bad", () => {
    expect(computeMetricDelta("count", "neutral", 10, 2).tone).toBe("neutral");
    expect(computeMetricDelta("count", "neutral", 1, 2).tone).toBe("neutral");
  });

  it("labels growth from zero as New instead of an infinite percent", () => {
    expect(computeMetricDelta("cents", "good", 500, 0)).toEqual({ direction: "up", label: "New", tone: "good" });
    expect(computeMetricDelta("cents", "bad", 500, 0).tone).toBe("bad");
  });

  it("reports rates in percentage points", () => {
    expect(computeMetricDelta("percent", "good", 90, 85)).toEqual({ direction: "up", label: "+5.0 pts", tone: "good" });
    expect(computeMetricDelta("percent", "bad", 3, 5)).toEqual({ direction: "down", label: "−2.0 pts", tone: "good" });
  });

  it("treats a negligible change as flat/neutral", () => {
    expect(computeMetricDelta("cents", "good", 100.01, 100)).toMatchObject({ direction: "flat", tone: "neutral" });
  });
});
