import { describe, it, expect } from "vitest";
import {
  buildHeadline,
  computeDelta,
  computeRetention,
  groupLongTail,
  parseReportingYear,
  reportingYearOptions,
  resolveReportingPeriod,
  retentionTone,
  withShares,
} from "../reportingPeriod";

describe("computeRetention", () => {
  it("is unavailable (not 0 or 100) when nobody gave in the base period", () => {
    const r = computeRetention({ gaveBefore: 0, gaveBeforeAndNow: 0 });
    expect(r.ratePercent).toBeNull();
    expect(r.reason).toBe("no_history");
  });

  it("is the share of the base period's donors who gave again", () => {
    const r = computeRetention({ gaveBefore: 20, gaveBeforeAndNow: 9 });
    expect(r.ratePercent).toBeCloseTo(45);
    expect(r.retained).toBe(9);
    expect(r.lapsed).toBe(11);
  });

  it("never exceeds 100% or goes negative on inconsistent input", () => {
    const r = computeRetention({ gaveBefore: 3, gaveBeforeAndNow: 5 });
    expect(r.ratePercent).toBe(100);
    expect(r.lapsed).toBe(0);
  });
});

describe("retentionTone", () => {
  it("bands the rate", () => {
    expect(retentionTone(75)).toBe("strong");
    expect(retentionTone(45)).toBe("steady");
    expect(retentionTone(12)).toBe("needs_attention");
  });
});

describe("computeDelta", () => {
  it("has no percent when the prior value is zero", () => {
    expect(computeDelta(500, 0)).toEqual({ percent: null, direction: "up" });
    expect(computeDelta(0, 0)).toEqual({ percent: null, direction: "flat" });
  });
  it("computes signed percent change", () => {
    expect(computeDelta(150, 100)).toEqual({ percent: 50, direction: "up" });
    expect(computeDelta(75, 100)).toEqual({ percent: -25, direction: "down" });
    expect(computeDelta(100, 100)).toEqual({ percent: 0, direction: "flat" });
  });
});

describe("reporting period", () => {
  const now = new Date(2026, 9, 6, 12, 0, 0); // 6 Oct 2026

  it("offers every year from the first gift to now, newest first", () => {
    expect(reportingYearOptions(2024, 2026)).toEqual([2026, 2025, 2024]);
    expect(reportingYearOptions(null, 2026)).toEqual([2026]);
  });

  it("falls back to the current year for junk or out-of-range ?year=", () => {
    expect(parseReportingYear("2025", 2026, 2024)).toBe(2025);
    expect(parseReportingYear("1999", 2026, 2024)).toBe(2026);
    expect(parseReportingYear("abc", 2026, 2024)).toBe(2026);
    expect(parseReportingYear(undefined, 2026, 2024)).toBe(2026);
  });

  it("current year runs Jan 1 to now and compares to the same span last year", () => {
    const p = resolveReportingPeriod(2026, now);
    expect(p.isCurrentYear).toBe(true);
    expect(p.range.lte).toEqual(now);
    expect(p.comparison.gte.getFullYear()).toBe(2025);
    expect(p.comparison.lte.getFullYear()).toBe(2025);
    expect(p.comparison.lte.getMonth()).toBe(9);
    expect(p.previousYear.lte.getMonth()).toBe(11);
  });

  it("a past year is the full year and compares to the full year before", () => {
    const p = resolveReportingPeriod(2025, now);
    expect(p.isCurrentYear).toBe(false);
    expect(p.range.gte.getFullYear()).toBe(2025);
    expect(p.range.lte.getMonth()).toBe(11);
    expect(p.comparison.gte.getFullYear()).toBe(2024);
    expect(p.comparison.lte.getMonth()).toBe(11);
  });
});

describe("buildHeadline", () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  it("summarises giving, donors and the dominant method", () => {
    expect(
      buildHeadline({
        year: 2026,
        isCurrentYear: true,
        givingCents: 455651,
        donorCount: 23,
        topMethod: { label: "card", sharePercent: 88 },
        formatMoney: fmt,
      }),
    ).toBe(
      "You've raised $4556.51 this year from 23 donors, mostly through card.",
    );
  });
  it("omits the method when no single method dominates and singularises one donor", () => {
    expect(
      buildHeadline({
        year: 2026,
        isCurrentYear: true,
        givingCents: 1000,
        donorCount: 1,
        topMethod: { label: "card", sharePercent: 40 },
        formatMoney: fmt,
      }),
    ).toBe("You've raised $10.00 this year from 1 donor.");
  });
  it("speaks in the past tense for a finished year", () => {
    expect(
      buildHeadline({
        year: 2025,
        isCurrentYear: false,
        givingCents: 1000,
        donorCount: 2,
        topMethod: null,
        formatMoney: fmt,
      }),
    ).toBe("You raised $10.00 in 2025 from 2 donors.");
  });
  it("has an empty-state sentence when there is no giving", () => {
    expect(
      buildHeadline({
        year: 2026,
        isCurrentYear: true,
        givingCents: 0,
        donorCount: 0,
        topMethod: null,
        formatMoney: fmt,
      }),
    ).toMatch(/No giving recorded yet/);
    expect(
      buildHeadline({
        year: 2024,
        isCurrentYear: false,
        givingCents: 0,
        donorCount: 0,
        topMethod: null,
        formatMoney: fmt,
      }),
    ).toBe("No giving was recorded in 2024.");
  });
});

describe("withShares / groupLongTail", () => {
  it("computes shares and tolerates an all-zero total", () => {
    const rows = withShares([{ valueCents: 300 }, { valueCents: 100 }]);
    expect(rows.map((r) => r.sharePercent)).toEqual([75, 25]);
    expect(withShares([{ valueCents: 0 }])[0].sharePercent).toBe(0);
  });

  it("keeps small lists as-is and folds the tail into Other", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      label: `F${n}`,
      valueCents: n * 100,
    }));
    expect(groupLongTail(rows.slice(0, 3), 5)).toHaveLength(3);
    const g = groupLongTail(rows, 5);
    expect(g).toHaveLength(5);
    expect(g[0].label).toBe("F7");
    expect(g[4]).toMatchObject({
      label: "Other",
      isOther: true,
      count: 3,
      valueCents: 300 + 200 + 100,
    });
  });
});
