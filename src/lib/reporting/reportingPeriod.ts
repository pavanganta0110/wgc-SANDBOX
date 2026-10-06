/**
 * Pure helpers behind the Reporting overview: which period the page is showing,
 * what it is compared against, and the donor-retention math. Kept free of
 * Prisma so the definitions can be unit tested.
 */
import { resolveYearRange } from "@/lib/dateRangePresets";
import type { DateRangeFilter } from "@/lib/donors/donorAggregates";

export interface ReportingPeriod {
  year: number;
  /** True while the selected year is still in progress (Jan 1 → today). */
  isCurrentYear: boolean;
  range: DateRangeFilter & { lte: Date };
  /** Same span a year earlier: same-day-of-year for the current year, the full prior year otherwise. */
  comparison: DateRangeFilter & { lte: Date };
  /** The full prior calendar year, regardless of how far into the current year we are. */
  previousYear: DateRangeFilter & { lte: Date };
  label: string;
  comparisonLabel: string;
}

/** Years offered in the selector: first year with giving through the current year, newest first. */
export function reportingYearOptions(
  firstGiftYear: number | null,
  currentYear: number,
): number[] {
  const first =
    firstGiftYear !== null && firstGiftYear <= currentYear
      ? firstGiftYear
      : currentYear;
  const years: number[] = [];
  for (let y = currentYear; y >= first; y--) years.push(y);
  return years;
}

/** Unknown or out-of-range ?year= values fall back to the current year rather than erroring. */
export function parseReportingYear(
  raw: string | undefined,
  currentYear: number,
  firstGiftYear: number | null,
): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  const options = reportingYearOptions(firstGiftYear, currentYear);
  return Number.isFinite(n) && options.includes(n) ? n : currentYear;
}

function bounds(year: number): DateRangeFilter & { lte: Date } {
  const r = resolveYearRange(year);
  return { gte: r.from!, lte: r.to! };
}

export function resolveReportingPeriod(
  year: number,
  now: Date = new Date(),
): ReportingPeriod {
  const currentYear = now.getFullYear();
  const isCurrentYear = year === currentYear;
  const full = bounds(year);
  const range = isCurrentYear ? { gte: full.gte, lte: now } : full;

  const prior = bounds(year - 1);
  let comparison = prior;
  if (isCurrentYear) {
    const sameDay = new Date(now);
    sameDay.setFullYear(year - 1);
    comparison = { gte: prior.gte, lte: sameDay };
  }

  return {
    year,
    isCurrentYear,
    range,
    comparison,
    previousYear: prior,
    label: isCurrentYear ? `${year} year to date` : String(year),
    comparisonLabel: isCurrentYear
      ? `same period in ${year - 1}`
      : String(year - 1),
  };
}

export interface RetentionInput {
  /** Donors who gave in the comparison period. */
  gaveBefore: number;
  /** Of those, the ones who also gave in the current period. */
  gaveBeforeAndNow: number;
}

export interface Retention {
  /** 0–100, or null when there is no prior-period giving to measure retention against. */
  ratePercent: number | null;
  retained: number;
  lapsed: number;
  /** Why the rate is unavailable. */
  reason: "no_history" | null;
}

/**
 * Donor retention = of the donors who gave in the comparison period, the share
 * who gave again in the current one. With nobody in the comparison period the
 * question has no answer, so the rate is null ("not enough history"), never 0 or 100.
 */
export function computeRetention({
  gaveBefore,
  gaveBeforeAndNow,
}: RetentionInput): Retention {
  if (gaveBefore <= 0)
    return { ratePercent: null, retained: 0, lapsed: 0, reason: "no_history" };
  const retained = Math.min(gaveBeforeAndNow, gaveBefore);
  return {
    ratePercent: (retained / gaveBefore) * 100,
    retained,
    lapsed: gaveBefore - retained,
    reason: null,
  };
}

export type RetentionTone = "strong" | "steady" | "needs_attention";

/** Banding for the retention meter. Thresholds follow common nonprofit benchmarks (~45% average, 60%+ strong). */
export function retentionTone(ratePercent: number): RetentionTone {
  if (ratePercent >= 60) return "strong";
  if (ratePercent >= 40) return "steady";
  return "needs_attention";
}

export interface Delta {
  /** Signed percent change, or null when the prior value is 0 (a % of zero is meaningless). */
  percent: number | null;
  direction: "up" | "down" | "flat";
}

export function computeDelta(current: number, previous: number): Delta {
  if (previous <= 0)
    return { percent: null, direction: current > 0 ? "up" : "flat" };
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent * 10) / 10;
  return {
    percent: rounded,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

export interface HeadlineInput {
  year: number;
  isCurrentYear: boolean;
  givingCents: number;
  donorCount: number;
  /** Largest payment-method share, if any giving. */
  topMethod: { label: string; sharePercent: number } | null;
  formatMoney: (cents: number) => string;
}

/** One-line plain-English summary shown under the page title. */
export function buildHeadline(i: HeadlineInput): string {
  if (i.givingCents <= 0) {
    return i.isCurrentYear
      ? "No giving recorded yet this year. Share your giving link to get started."
      : `No giving was recorded in ${i.year}.`;
  }
  const verb = i.isCurrentYear ? "You've raised" : "You raised";
  const when = i.isCurrentYear ? "this year" : `in ${i.year}`;
  const donors = `${i.donorCount.toLocaleString("en-US")} donor${i.donorCount === 1 ? "" : "s"}`;
  const via =
    i.topMethod && i.topMethod.sharePercent >= 50
      ? `, mostly through ${i.topMethod.label}`
      : "";
  return `${verb} ${i.formatMoney(i.givingCents)} ${when} from ${donors}${via}.`;
}

export interface MixShare {
  key: string;
  label: string;
  valueCents: number;
  sharePercent: number;
}

/** Share of total for each row; all zeros yields 0% rather than NaN. */
export function withShares<T extends { valueCents: number }>(
  rows: T[],
): (T & { sharePercent: number })[] {
  const total = rows.reduce((s, r) => s + r.valueCents, 0);
  return rows.map((r) => ({
    ...r,
    sharePercent: total > 0 ? (r.valueCents / total) * 100 : 0,
  }));
}

/** Keeps the top `max` rows and folds the rest into a single "Other" row. */
export function groupLongTail<T extends { label: string; valueCents: number }>(
  rows: T[],
  max: number,
): { label: string; valueCents: number; isOther: boolean; count: number }[] {
  const sorted = [...rows].sort((a, b) => b.valueCents - a.valueCents);
  if (sorted.length <= max)
    return sorted.map((r) => ({
      label: r.label,
      valueCents: r.valueCents,
      isOther: false,
      count: 1,
    }));
  const head = sorted
    .slice(0, max - 1)
    .map((r) => ({
      label: r.label,
      valueCents: r.valueCents,
      isOther: false,
      count: 1,
    }));
  const tail = sorted.slice(max - 1);
  return [
    ...head,
    {
      label: "Other",
      valueCents: tail.reduce((s, r) => s + r.valueCents, 0),
      isOther: true,
      count: tail.length,
    },
  ];
}
