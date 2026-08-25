import { describe, it, expect } from "vitest";
import { formatDateCDT, formatCalendarDateUTC } from "../formatDateTimeCDT";

describe("formatCalendarDateUTC", () => {
  it("shows the correct calendar day for a UTC-midnight timestamp — regression for WgcSubscription.nextChargeAt displaying one day early", () => {
    // Built the same way wgcSubscriptionService.ts derives nextChargeAt from
    // Finix's next_billing_date {year, month, day}: Date.UTC(2026, 7, 24)
    // (month is 0-indexed) is always midnight UTC on Aug 24, with no real
    // intraday meaning — only the calendar date matters.
    const nextChargeAt = new Date(Date.UTC(2026, 7, 24));

    // The bug: formatDateCDT converts to Central time first, which shifts
    // a UTC-midnight timestamp back into the previous calendar day for any
    // US timezone — confirmed against the real report (Aug 24 shown as
    // "Aug 23"). formatCalendarDateUTC must not have this problem.
    expect(formatDateCDT(nextChargeAt)).toBe("Aug 23, 2026");
    expect(formatCalendarDateUTC(nextChargeAt)).toBe("Aug 24, 2026");
  });

  it("returns an em dash for null/undefined, matching formatDateCDT's contract", () => {
    expect(formatCalendarDateUTC(null)).toBe("—");
    expect(formatCalendarDateUTC(undefined)).toBe("—");
  });

  it("accepts a string date the same way it accepts a Date object", () => {
    expect(formatCalendarDateUTC("2026-08-24T00:00:00.000Z")).toBe("Aug 24, 2026");
  });
});
