import { describe, it, expect } from "vitest";
import { reconciledThroughDate } from "@/lib/reports/wgcProfit";

describe("reconciledThroughDate", () => {
  it("before the 16th: only two months back has fully cleared its reconciliation window", () => {
    // Sept 2 — August hasn't reconciled yet (reconciles Sept 16), so only
    // July (reconciled Aug 16, already passed) is safe. Reconciled through
    // end of July = start of August.
    const result = reconciledThroughDate(new Date(Date.UTC(2026, 8, 2)));
    expect(result.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("on the 16th: the prior month has just cleared its reconciliation window", () => {
    // Sept 16 — August's data (reconciles by Sept 16) is now considered
    // final. Reconciled through end of August = start of September.
    const result = reconciledThroughDate(new Date(Date.UTC(2026, 8, 16)));
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("after the 16th: same as on-the-16th for the rest of the month", () => {
    const result = reconciledThroughDate(new Date(Date.UTC(2026, 8, 28)));
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("crosses a year boundary correctly", () => {
    // Jan 2 — December hasn't reconciled yet, only November has.
    const result = reconciledThroughDate(new Date(Date.UTC(2027, 0, 2)));
    expect(result.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
