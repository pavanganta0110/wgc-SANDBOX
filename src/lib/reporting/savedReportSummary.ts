/**
 * One-line, human-readable summary of a saved report's stored configuration, for the Saved Reports cards.
 * Display only: it reads the stored JSON defensively and never validates or alters it.
 */
const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This week",
  mtd: "This month",
  qtd: "This quarter",
  ytd: "Year to date",
  last_year: "Last year",
  "30d": "Previous 30 days",
  "90d": "Previous 90 days",
  "12m": "Previous 12 months",
  all: "All time",
};

const SEGMENT_LABELS: Record<string, string> = {
  NEW: "New donors",
  RETURNING: "Returning donors",
  RECURRING: "Recurring donors",
  LAPSED: "Lapsed donors",
  MAJOR_DONOR: "Major donors",
  INCREASED_GIVING: "Increased giving",
  DECREASED_GIVING: "Decreased giving",
  ONE_TIME: "One-time donors",
  MONTHLY_RECURRING: "Monthly recurring",
  WEEKLY_RECURRING: "Weekly recurring",
  FAILED_RECURRING: "Failed recurring",
  NO_EMAIL: "No email",
  NO_ADDRESS: "No mailing address",
  EXTERNAL_ONLY: "External-only donors",
  IN_KIND_DONOR: "In-kind donors",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function dollars(cents: unknown): string | null {
  return typeof cents === "number" && Number.isFinite(cents)
    ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : null;
}

export function summarizeSavedReportConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const out: string[] = [];

  const range = config.dateRange;
  if (isRecord(range)) {
    const key = typeof range.key === "string" ? range.key : "";
    if (key === "year" && typeof range.year === "number")
      out.push(String(range.year));
    else if (
      key === "custom" &&
      typeof range.from === "string" &&
      typeof range.to === "string"
    )
      out.push(`${range.from} to ${range.to}`);
    else if (RANGE_LABELS[key]) out.push(RANGE_LABELS[key]);
  }

  if (config.amountCalculation === "GROSS") out.push("Gross giving");
  else if (config.amountCalculation === "NET") out.push("Net giving");

  const filters = isRecord(config.filters) ? config.filters : {};
  if (typeof filters.segment === "string" && filters.segment)
    out.push(SEGMENT_LABELS[filters.segment] ?? filters.segment);
  const params = isRecord(filters.segmentParams) ? filters.segmentParams : {};
  if (typeof params.lapsedDays === "number")
    out.push(`Lapsed ${params.lapsedDays}+ days`);
  if (typeof filters.search === "string" && filters.search)
    out.push(`Search “${filters.search}”`);
  const min = dollars(filters.minAmountCents);
  const max = dollars(filters.maxAmountCents);
  if (min && max) out.push(`${min}–${max}`);
  else if (min) out.push(`Min ${min}`);
  else if (max) out.push(`Max ${max}`);

  const sources = isRecord(config.sources) ? config.sources : {};
  const hidden = Object.values(sources).filter((v) => v === false).length;
  if (hidden > 0)
    out.push(`${hidden} source${hidden === 1 ? "" : "s"} excluded`);

  return out;
}
