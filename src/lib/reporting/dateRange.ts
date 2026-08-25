import { resolveDateRange, resolveYearRange, type DateRange } from "@/lib/dateRangePresets";
import type { ReportDateRange } from "./types";

/** Turns a validated ReportDateRange into concrete from/to bounds, reusing the app's one shared date-range resolver rather than a second implementation. */
export function resolveReportDateRange(range: ReportDateRange): DateRange {
  if (range.key === "year" && range.year !== undefined) {
    return resolveYearRange(range.year);
  }
  return resolveDateRange(range.key === "year" ? undefined : range.key, range.from, range.to);
}

export function toPrismaDateFilter(range: DateRange): { gte: Date; lte?: Date } | undefined {
  if (!range.from) return undefined;
  return range.to ? { gte: range.from, lte: range.to } : { gte: range.from };
}

/** Jan 1 - now, in the same America/Chicago convention as every other date boundary in the app. */
export function ytdRange(): DateRange {
  return resolveDateRange("ytd");
}

/** The full previous calendar year. */
export function previousYearRange(): DateRange {
  return resolveDateRange("last_year");
}
