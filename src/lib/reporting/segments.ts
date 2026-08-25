import type { DonorReportRow, SegmentKey, SegmentParams } from "./types";
import type { DateRange } from "@/lib/dateRangePresets";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A donor "matches" a segment based on already-computed aggregate columns
 * on the row (never a second per-donor query — see donorReport.ts, which
 * computes every needed aggregate in one batch before this ever runs).
 * Some segments (INCREASED_GIVING/DECREASED_GIVING) compare the selected
 * period against the same period one year prior as a documented, simple
 * proxy for "year-over-year change" — the dedicated Year-over-Year report
 * (lib/reporting/yearOverYear.ts) does a real two-period comparison for
 * cases that need it precisely.
 */
export function donorMatchesSegment(
  row: DonorReportRow,
  segment: SegmentKey,
  params: SegmentParams | undefined,
  periodRange: DateRange,
  now: Date,
): boolean {
  switch (segment) {
    case "NEW":
      return Boolean(
        row.firstDonationDate &&
          (!periodRange.from || row.firstDonationDate >= periodRange.from) &&
          (!periodRange.to || row.firstDonationDate <= periodRange.to),
      );
    case "RETURNING":
      return Boolean(row.firstDonationDate && periodRange.from && row.firstDonationDate < periodRange.from && row.periodGivingCents > 0);
    case "RECURRING":
      return row.isRecurringDonor;
    case "LAPSED": {
      if (!row.lastDonationDate) return false;
      const days = params?.lapsedDays ?? 90;
      return now.getTime() - row.lastDonationDate.getTime() >= days * DAY_MS;
    }
    case "MAJOR_DONOR": {
      const threshold = params?.majorDonorThresholdCents ?? 100000;
      const basis = params?.majorDonorBasis ?? "PERIOD";
      const amount =
        basis === "YTD"
          ? row.ytdGivingCents
          : basis === "ANNUAL"
            ? row.previousYearGivingCents
            : basis === "LIFETIME"
              ? row.lifetimeGivingCents
              : row.periodGivingCents;
      return amount >= threshold;
    }
    case "INCREASED_GIVING":
      return row.periodGivingCents > row.previousYearGivingCents;
    case "DECREASED_GIVING":
      return row.previousYearGivingCents > 0 && row.periodGivingCents < row.previousYearGivingCents;
    case "ONE_TIME":
      return row.donationCount === 1 && !row.isRecurringDonor;
    case "MONTHLY_RECURRING":
      return row.isRecurringDonor && (row.givingFrequency || "").toUpperCase().includes("MONTH");
    case "WEEKLY_RECURRING":
      return row.isRecurringDonor && (row.givingFrequency || "").toUpperCase().includes("WEEK");
    case "FAILED_RECURRING":
      return (row.givingFrequency || "") === "FAILED";
    case "NO_EMAIL":
      return !row.email;
    case "NO_ADDRESS":
      return !row.address && !row.city && !row.state && !row.postalCode;
    case "EXTERNAL_ONLY":
      return row.externalGivingCents + row.cashGivingCents + row.checkGivingCents > 0 && row.cardGivingCents === 0 && row.achGivingCents === 0;
    case "IN_KIND_DONOR":
      return row.inKindValueCents > 0;
    default:
      return true;
  }
}

/** Segments whose match logic needs the payment-method breakdown loaded, even if no method-split column was explicitly requested. */
export const SEGMENTS_REQUIRING_BREAKDOWN: SegmentKey[] = ["EXTERNAL_ONLY", "IN_KIND_DONOR"];

// Percentage-change thresholds for a future "major increase/decrease" quick
// filter (item 8) — kept configurable/exported rather than inlined so the
// UI can surface them as adjustable, per item 8's "make thresholds
// configurable where reasonable."
export const MAJOR_CHANGE_THRESHOLD_PERCENT = 50;

export function percentChange(periodA: number, periodB: number): number | null {
  if (periodA === 0) return periodB === 0 ? 0 : null; // undefined % change from zero — handled safely, never divides by zero
  return ((periodB - periodA) / periodA) * 100;
}
