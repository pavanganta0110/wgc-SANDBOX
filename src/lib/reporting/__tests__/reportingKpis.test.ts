import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DonorAggregates } from "@/lib/donors/donorAggregates";
import { EMPTY_DONOR_AGGREGATES } from "@/lib/donors/donorAggregates";
import { resolveReportingPeriod } from "../reportingPeriod";

/**
 * Regression for the Reporting overview showing "0 new / N returning" and a
 * "1.0%" retention with no prior-year giving: the KPI loader used to call the
 * analytics engine with NO date range (so nobody could be "new") and printed a
 * 0-1 fraction as a percent. It must now scope to the selected period and report
 * retention as null when there is no prior-year giving.
 */

const mockAnalytics = vi.fn();
vi.mock("@/lib/donors/donorAnalyticsExtended", () => ({
  loadDonorAnalyticsExtended: (...a: unknown[]) => mockAnalytics(...a),
}));

const mockAgg = vi.fn();
vi.mock("@/lib/donors/donorAggregates", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/donors/donorAggregates")>();
  return {
    ...actual,
    loadDonorAggregatesBatch: (...a: unknown[]) => mockAgg(...a),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    donor: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "d1" }, { id: "d2" }, { id: "d3" }]),
    },
  },
}));
vi.mock("@/lib/auth/viewScope", () => ({
  resolveViewScope: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/scopes", () => ({
  resolveScopedDonorIds: vi.fn().mockResolvedValue(null),
}));

import { loadReportingKpis } from "../dashboard";

const agg = (over: Partial<DonorAggregates>): DonorAggregates => ({
  ...EMPTY_DONOR_AGGREGATES,
  ...over,
});
const auth = { churchId: "church-1" } as never;
const period = resolveReportingPeriod(2026, new Date(2026, 9, 6));

function stubAggregates(byRange: {
  period: Record<string, DonorAggregates>;
  previous: Record<string, DonorAggregates>;
  lifetime?: Record<string, DonorAggregates>;
}) {
  mockAgg.mockImplementation(
    async (ids: string[], _church: string, range?: { gte: Date }) => {
      const table = !range
        ? (byRange.lifetime ?? byRange.period)
        : range.gte.getTime() === period.range.gte.getTime()
          ? byRange.period
          : byRange.previous;
      return new Map(
        ids.map((id) => [id, table[id] ?? EMPTY_DONOR_AGGREGATES]),
      );
    },
  );
}

describe("loadReportingKpis", () => {
  beforeEach(() => {
    mockAnalytics.mockReset();
    mockAgg.mockReset();
    mockAnalytics.mockResolvedValue({
      newVsReturning: { newCount: 2, returningCount: 0 },
      oneTimeVsRecurring: { uniqueRecurringDonors: 1 },
    });
  });

  it("scopes the analytics to the selected period and the previous year (never an unbounded range)", async () => {
    stubAggregates({ period: {}, previous: {} });
    await loadReportingKpis(auth, period);
    const [church, range, previous] = mockAnalytics.mock.calls[0];
    expect(church).toBe("church-1");
    expect(range).toEqual(period.range);
    expect(previous).toEqual(period.previousYear);
  });

  it("reports retention as null (not 0%, 1% or 100%) when nobody gave last year", async () => {
    stubAggregates({
      period: {
        d1: agg({ donationCount: 2, netDonatedCents: 5000 }),
        d2: agg({ donationCount: 1, netDonatedCents: 2500 }),
      },
      previous: {},
    });
    const kpis = await loadReportingKpis(auth, period);
    expect(kpis.donorRetentionRatePercent).toBeNull();
    expect(kpis.lapsedDonors).toBe(0);
    expect(kpis.priorYearDonors).toBe(0);
    expect(kpis.givingDonors).toBe(2);
    expect(kpis.ytdGivingCents).toBe(7500);
    expect(kpis.averageGiftCents).toBe(2500);
  });

  it("computes retention and lapsed from last year's donors", async () => {
    stubAggregates({
      period: { d1: agg({ donationCount: 1, netDonatedCents: 1000 }) },
      previous: {
        d1: agg({ donationCount: 3, netDonatedCents: 9000 }),
        d2: agg({ donationCount: 1, netDonatedCents: 500 }),
        d3: agg({ donationCount: 2, netDonatedCents: 700 }),
      },
    });
    const kpis = await loadReportingKpis(auth, period);
    expect(kpis.priorYearDonors).toBe(3);
    expect(kpis.donorRetentionRatePercent).toBeCloseTo(33.33, 1);
    expect(kpis.lapsedDonors).toBe(2);
    expect(kpis.previousYearGivingCents).toBe(10200);
  });
});
