/**
 * Server-side schema validation for a client-submitted ReportDefinition.
 * This is the FIRST Zod usage in the merchant API tree (existing merchant
 * routes validate manually) — a deliberate departure, not an oversight:
 * item 34 asks for strong schema validation rejecting arbitrary field
 * names/raw input, which a hand-rolled parser for a shape this deep
 * (nested filters, dynamic column lists, segment params) would reproduce
 * worse. zod is already a project dependency (package.json), just unused
 * here before now.
 *
 * Every reporting API route must call parseReportDefinition() before
 * touching Prisma — never trust reportType/columns/sortBy/etc. as bare
 * strings from the request body.
 */
import { z } from "zod";
import {
  REPORT_TYPES,
  DONOR_REPORT_COLUMNS,
  SEGMENT_KEYS,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  type ReportDefinition,
} from "./types";

const dateRangeKeySchema = z.enum([
  "today",
  "yesterday",
  "7d",
  "30d",
  "3m",
  "6m",
  "mtd",
  "qtd",
  "ytd",
  "prev_month",
  "this_week",
  "90d",
  "12m",
  "last_year",
  "all",
  "custom",
  "year",
]);

const dateRangeSchema = z
  .object({
    key: dateRangeKeySchema,
    from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    // Any integer year is valid — never a hardcoded allowlist (item 3).
    // Bounded to a sane range purely to reject garbage/overflow input, not
    // to restrict which real years a merchant can report on.
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .refine((v) => v.key !== "custom" || (v.from && v.to), { message: "custom date range requires from and to" })
  .refine((v) => v.key !== "year" || v.year !== undefined, { message: "year date range requires year" });

const sourceTogglesSchema = z.object({
  card: z.boolean(),
  ach: z.boolean(),
  external: z.boolean(),
  cash: z.boolean(),
  check: z.boolean(),
  inKind: z.boolean(),
  recurring: z.boolean(),
  oneTime: z.boolean(),
  refunded: z.boolean(),
  achReturns: z.boolean(),
  failedPayments: z.boolean(),
  anonymous: z.boolean(),
});

const segmentParamsSchema = z
  .object({
    lapsedDays: z.number().int().min(1).max(3650).optional(),
    majorDonorThresholdCents: z.number().int().min(0).optional(),
    majorDonorBasis: z.enum(["PERIOD", "YTD", "ANNUAL", "LIFETIME"]).optional(),
  })
  .optional();

const filtersSchema = z.object({
  search: z.string().max(200).optional(),
  minAmountCents: z.number().int().min(0).optional(),
  maxAmountCents: z.number().int().min(0).optional(),
  fundIds: z.array(z.string().min(1)).max(100).optional(),
  givingLinkIds: z.array(z.string().min(1)).max(100).optional(),
  paymentMethods: z.array(z.string().min(1).max(50)).max(30).optional(),
  recurringStatus: z.array(z.enum(["ACTIVE", "PAUSED", "PAST_DUE", "FAILED", "CANCELED", "COMPLETED"])).max(10).optional(),
  attributedUserId: z.string().min(1).optional(),
  anonymousOnly: z.boolean().optional(),
  excludeAnonymous: z.boolean().optional(),
  externalOnly: z.boolean().optional(),
  inKindOnly: z.boolean().optional(),
  refundedOnly: z.boolean().optional(),
  achReturnedOnly: z.boolean().optional(),
  segment: z.enum(SEGMENT_KEYS).optional(),
  segmentParams: segmentParamsSchema,
});

export const reportDefinitionSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  dateRange: dateRangeSchema,
  sources: sourceTogglesSchema,
  amountCalculation: z.enum(["GROSS", "NET"]),
  columns: z.array(z.enum(DONOR_REPORT_COLUMNS)).min(1).max(DONOR_REPORT_COLUMNS.length),
  filters: filtersSchema,
  groupBy: z.enum(["DONOR", "FUND", "CAMPAIGN", "GIVING_PAGE", "PAYMENT_METHOD", "MONTH", "YEAR"]).optional(),
  sortBy: z.enum(["AMOUNT", "DATE", "DONOR_NAME", "LIFETIME_GIVING", "GIFT_COUNT"]),
  sortDirection: z.enum(["asc", "desc"]),
  page: z.number().int().min(1).max(10000),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
});

export type ParsedReportDefinition = z.infer<typeof reportDefinitionSchema>;

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}

/** Parses and validates a raw request body into a ReportDefinition, or throws ReportValidationError with a safe, specific message. */
export function parseReportDefinition(body: unknown): ReportDefinition {
  const result = reportDefinitionSchema.safeParse(body);
  if (!result.success) {
    throw new ReportValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data as ReportDefinition;
}

/** Same shape, but page/pageSize are optional and default to a full-export-friendly size — used only by the export route, never the interactive query route. */
export const savedReportConfigSchema = reportDefinitionSchema.omit({ page: true, pageSize: true }).extend({
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const savedReportNameSchema = z.string().trim().min(1, "Report name is required").max(120);
export const savedReportVisibilitySchema = z.enum(["PRIVATE", "ORGANIZATION"]);
