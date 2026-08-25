/**
 * Shared type vocabulary for the Donor Analytics & Reporting engine. One
 * ReportDefinition shape powers every report type (dashboard tables, saved
 * reports, CSV/Excel exports) — see lib/reporting/validation.ts for the
 * server-side schema that validates a definition before it's ever used to
 * build a Prisma query, and donorReport.ts/annualReport.ts/etc. for the
 * services that turn a validated definition into results.
 */

export const REPORT_TYPES = [
  "DONORS",
  "GIVING",
  "ANNUAL",
  "RECURRING",
  "LAPSED",
  "FUND_CAMPAIGN",
  "YEAR_OVER_YEAR",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

// Matches dateRangePresets.ts's RANGE_PRESETS keys, plus "custom" and
// "year" (a single arbitrary calendar year via resolveYearRange).
export type DateRangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "3m"
  | "6m"
  | "mtd"
  | "qtd"
  | "ytd"
  | "prev_month"
  | "this_week"
  | "90d"
  | "12m"
  | "last_year"
  | "all"
  | "custom"
  | "year";

export interface ReportDateRange {
  key: DateRangeKey;
  from?: string; // ISO date, required when key === "custom"
  to?: string; // ISO date, required when key === "custom"
  year?: number; // required when key === "year" — any integer, never a hardcoded list
}

/**
 * Which underlying transaction types are included. The engine treats
 * "WGC-processed" (Payment/FinixSubscription, via Finix) and "external"
 * (ExternalDonation) as structurally different sources — see
 * donorAggregates.ts's own doc comment on externalDonatedCents for why
 * they're never silently merged into one undifferentiated number.
 */
export interface SourceToggles {
  card: boolean;
  ach: boolean;
  external: boolean; // any ExternalDonation row not otherwise broken out below
  cash: boolean;
  check: boolean;
  inKind: boolean; // ExternalDonation.paymentMethod === "OTHER" with donationPurpose/note indicating in-kind — see lib/reporting/aggregations.ts's IN_KIND heuristic
  recurring: boolean;
  oneTime: boolean;
  refunded: boolean; // include donations that were later (partially or fully) refunded
  achReturns: boolean; // include donations that were later returned
  failedPayments: boolean;
  anonymous: boolean; // include anonymous gifts in totals (never de-anonymizes in named-donor exports — see AMOUNT below)
}

export const DEFAULT_SOURCE_TOGGLES: SourceToggles = {
  card: true,
  ach: true,
  external: true,
  cash: true,
  check: true,
  inKind: true,
  recurring: true,
  oneTime: true,
  refunded: true,
  achReturns: false,
  failedPayments: false,
  anonymous: true,
};

export type AmountCalculation = "GROSS" | "NET";

export interface ReportFilters {
  search?: string; // donor name/email/phone, server-side only (never client-side filter of a full list)
  minAmountCents?: number;
  maxAmountCents?: number;
  fundIds?: string[];
  givingLinkIds?: string[];
  paymentMethods?: string[]; // ExternalDonation.paymentMethod values + "CARD"/"ACH"
  recurringStatus?: ("ACTIVE" | "PAUSED" | "PAST_DUE" | "FAILED" | "CANCELED" | "COMPLETED")[];
  attributedUserId?: string; // assigned fundraiser/sub-user; server still enforces the viewer's own scope on top of this
  anonymousOnly?: boolean;
  excludeAnonymous?: boolean;
  externalOnly?: boolean;
  inKindOnly?: boolean;
  refundedOnly?: boolean;
  achReturnedOnly?: boolean;
  segment?: SegmentKey;
  segmentParams?: SegmentParams;
}

export const SEGMENT_KEYS = [
  "NEW",
  "RETURNING",
  "RECURRING",
  "LAPSED",
  "MAJOR_DONOR",
  "INCREASED_GIVING",
  "DECREASED_GIVING",
  "ONE_TIME",
  "MONTHLY_RECURRING",
  "WEEKLY_RECURRING",
  "FAILED_RECURRING",
  "NO_EMAIL",
  "NO_ADDRESS",
  "EXTERNAL_ONLY",
  "IN_KIND_DONOR",
] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

export interface SegmentParams {
  lapsedDays?: number; // 30/60/90/180/365/custom
  majorDonorThresholdCents?: number; // 50000/100000/500000/1000000/custom
  majorDonorBasis?: "PERIOD" | "YTD" | "ANNUAL" | "LIFETIME";
}

export const DONOR_REPORT_COLUMNS = [
  "donorName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "companyName",
  "address",
  "city",
  "state",
  "postalCode",
  "firstDonationDate",
  "lastDonationDate",
  "donationCount",
  "averageDonationCents",
  "largestDonationCents",
  "smallestDonationCents",
  "ytdGivingCents",
  "previousYearGivingCents",
  "periodGivingCents",
  "lifetimeGivingCents",
  "cardGivingCents",
  "achGivingCents",
  "externalGivingCents",
  "cashGivingCents",
  "checkGivingCents",
  "inKindValueCents",
  "refundedAmountCents",
  "returnedAmountCents",
  "isRecurringDonor",
  "recurringAmountCents",
  "givingFrequency",
  "givingPage",
  "fund",
  "purpose",
  "attributedUserName",
] as const;
export type DonorReportColumn = (typeof DONOR_REPORT_COLUMNS)[number];

export const DEFAULT_DONOR_COLUMNS: DonorReportColumn[] = [
  "donorName",
  "email",
  "lastDonationDate",
  "donationCount",
  "periodGivingCents",
  "lifetimeGivingCents",
  "isRecurringDonor",
];

export type GroupByKey = "DONOR" | "FUND" | "CAMPAIGN" | "GIVING_PAGE" | "PAYMENT_METHOD" | "MONTH" | "YEAR";
export type SortByKey = "AMOUNT" | "DATE" | "DONOR_NAME" | "LIFETIME_GIVING" | "GIFT_COUNT";
export type SortDirection = "asc" | "desc";

export interface ReportDefinition {
  reportType: ReportType;
  dateRange: ReportDateRange;
  sources: SourceToggles;
  amountCalculation: AmountCalculation;
  columns: DonorReportColumn[];
  filters: ReportFilters;
  groupBy?: GroupByKey;
  sortBy: SortByKey;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;
// Any filter/sort/segment that depends on a computed financial aggregate
// requires the full matching donor set to be aggregated in memory before
// pagination/sorting can happen (Postgres can't sort by a value that lives
// across three different tables in one indexed query here). Bounded the
// same defensive way subscriptionAggregates.ts bounds SUBSCRIPTION_CANDIDATE_CAP,
// so one merchant's very large donor history can't degrade the request
// into an unbounded scan. Surfaced to the UI (see ReportResult.truncated)
// rather than silently dropping donors.
export const MAX_AGGREGATED_DONORS = 5000;
// Absolute ceiling on a single export's row count for the same reason —
// communicated in the UI per item 25's requirement, not a silent cutoff.
export const MAX_EXPORT_ROWS = 20000;

export interface DonorReportRow {
  donorId: string;
  donorName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  firstDonationDate: Date | null;
  lastDonationDate: Date | null;
  donationCount: number;
  averageDonationCents: number;
  largestDonationCents: number;
  smallestDonationCents: number;
  ytdGivingCents: number;
  previousYearGivingCents: number;
  periodGivingCents: number;
  lifetimeGivingCents: number;
  cardGivingCents: number;
  achGivingCents: number;
  externalGivingCents: number;
  cashGivingCents: number;
  checkGivingCents: number;
  inKindValueCents: number;
  refundedAmountCents: number;
  returnedAmountCents: number;
  isRecurringDonor: boolean;
  recurringAmountCents: number;
  givingFrequency: string | null;
  givingPage: string | null;
  fund: string | null;
  purpose: string | null;
  attributedUserName: string | null;
}

export interface ReportResult<TRow> {
  rows: TRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  truncated: boolean; // true if MAX_AGGREGATED_DONORS was hit — result is a partial view, surfaced to the UI, never hidden
}

export interface ReportKpis {
  totalDonors: number;
  newDonors: number;
  returningDonors: number;
  recurringDonors: number;
  lapsedDonors: number;
  averageGiftCents: number;
  ytdGivingCents: number;
  previousYearGivingCents: number;
  lifetimeGivingCents: number;
  donorRetentionRatePercent: number;
}
