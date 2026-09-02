import { describe, it, expect } from "vitest";

// Mirrors previousCalendarMonthRange() in
// src/app/api/cron/resync-monthly-transfer-fees/route.ts — not exported
// from the route module (Next.js route files only export HTTP method
// handlers), so the exact logic is duplicated here deliberately small and
// verified against known calendar edge cases (leap year, year boundary).
function previousCalendarMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, end };
}

describe("resync-monthly-transfer-fees previousCalendarMonthRange", () => {
  it("returns all of August when run on September 16", () => {
    const { start, end } = previousCalendarMonthRange(new Date(Date.UTC(2026, 8, 16)));
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("crosses a year boundary correctly (January run covers December)", () => {
    const { start, end } = previousCalendarMonthRange(new Date(Date.UTC(2027, 0, 16)));
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles a leap-year February correctly (March run covers all 29 days)", () => {
    // 2028 is a leap year.
    const { start, end } = previousCalendarMonthRange(new Date(Date.UTC(2028, 2, 16)));
    expect(start.toISOString()).toBe("2028-02-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });
});
