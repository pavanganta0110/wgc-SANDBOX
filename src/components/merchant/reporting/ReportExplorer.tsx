"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { formatCents } from "@/lib/format";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Mail,
  Minus,
  Save,
  Search,
  SearchX,
  SlidersHorizontal,
  Users,
  X,
  CalendarRange,
  Scale,
  Filter,
} from "lucide-react";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import PageHeader from "./ui/PageHeader";
import SummaryStrip from "./ui/SummaryStrip";
import Avatar from "./ui/Avatar";
import StatusPill from "./ui/StatusPill";
import EmptyState from "./ui/EmptyState";
import { TableSkeleton } from "./ui/Skeleton";
import {
  FilterChip,
  PrimaryButton,
  SegmentedChoice,
  SelectField,
  ToolButton,
  FOCUS,
} from "./ui/controls";

const DONOR_REPORT_COLUMNS = [
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
type Column = (typeof DONOR_REPORT_COLUMNS)[number];

const COLUMN_LABELS: Record<Column, string> = {
  donorName: "Donor Name",
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  phone: "Phone",
  companyName: "Company/Organization",
  address: "Address",
  city: "City",
  state: "State",
  postalCode: "ZIP",
  firstDonationDate: "First Donation Date",
  lastDonationDate: "Most Recent Donation Date",
  donationCount: "# Donations",
  averageDonationCents: "Average Donation",
  largestDonationCents: "Largest Donation",
  smallestDonationCents: "Smallest Donation",
  ytdGivingCents: "YTD Giving",
  previousYearGivingCents: "Previous Year Giving",
  periodGivingCents: "Selected Period Giving",
  lifetimeGivingCents: "Lifetime Giving",
  cardGivingCents: "Card Giving",
  achGivingCents: "ACH Giving",
  externalGivingCents: "External Giving",
  cashGivingCents: "Cash Giving",
  checkGivingCents: "Check Giving",
  inKindValueCents: "In-Kind Value",
  refundedAmountCents: "Refunded",
  returnedAmountCents: "Returned",
  isRecurringDonor: "Recurring Donor",
  recurringAmountCents: "Recurring Amount",
  givingFrequency: "Giving Frequency",
  givingPage: "Giving Page",
  fund: "Fund",
  purpose: "Purpose",
  attributedUserName: "Assigned Fundraiser",
};

const CENTS_COLUMNS = new Set<Column>([
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
  "recurringAmountCents",
]);
const DATE_COLUMNS = new Set<Column>(["firstDonationDate", "lastDonationDate"]);

const DEFAULT_COLUMNS: Column[] = [
  "donorName",
  "email",
  "lastDonationDate",
  "donationCount",
  "periodGivingCents",
  "lifetimeGivingCents",
  "isRecurringDonor",
];

const DATE_RANGE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "mtd", label: "This Month" },
  { key: "qtd", label: "This Quarter" },
  { key: "ytd", label: "Year to Date" },
  { key: "last_year", label: "Last Year" },
  { key: "30d", label: "Previous 30 Days" },
  { key: "90d", label: "Previous 90 Days" },
  { key: "12m", label: "Previous 12 Months" },
  { key: "year", label: "Calendar Year..." },
  { key: "custom", label: "Custom Range..." },
  { key: "all", label: "All Time" },
];

const SOURCE_TOGGLE_LABELS: { key: keyof SourceToggles; label: string }[] = [
  { key: "card", label: "Card" },
  { key: "ach", label: "ACH" },
  { key: "external", label: "External/Manual" },
  { key: "cash", label: "Cash" },
  { key: "check", label: "Check" },
  { key: "inKind", label: "In-Kind Gifts" },
  { key: "recurring", label: "Recurring" },
  { key: "oneTime", label: "One-Time" },
  { key: "refunded", label: "Refunded" },
  { key: "achReturns", label: "ACH Returns" },
  { key: "failedPayments", label: "Failed Payments" },
  { key: "anonymous", label: "Anonymous Gifts" },
];

interface SourceToggles {
  card: boolean;
  ach: boolean;
  external: boolean;
  cash: boolean;
  check: boolean;
  inKind: boolean;
  recurring: boolean;
  oneTime: boolean;
  refunded: boolean;
  achReturns: boolean;
  failedPayments: boolean;
  anonymous: boolean;
}
const DEFAULT_SOURCES: SourceToggles = {
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

interface ReportRow {
  donorId: string;
  [key: string]: unknown;
}

interface ReportResult {
  rows: ReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  truncated: boolean;
}

function formatCentsDisplay(cents: number): string {
  return formatCents(cents);
}
function formatDateDisplay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function cellValue(row: ReportRow, col: Column): string {
  const v = row[col];
  if (v === null || v === undefined) return "—";
  if (CENTS_COLUMNS.has(col)) return formatCentsDisplay(v as number);
  if (DATE_COLUMNS.has(col)) return formatDateDisplay(v as string);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export interface ReportHeader {
  current: string;
  title: string;
  subtitle: string;
}

export default function ReportExplorer({
  reportType,
  fixedDateRange,
  canManageSavedReports,
  canExportReports,
  header,
  afterHeader,
}: {
  reportType: "DONORS" | "ANNUAL" | "LAPSED" | "RECURRING";
  fixedDateRange?: { key: string; year?: number };
  canManageSavedReports: boolean;
  canExportReports: boolean;
  header: ReportHeader;
  /** Optional content rendered between the page header and the summary strip (e.g. the Top Donors leaderboard). */
  afterHeader?: React.ReactNode;
}) {
  const [dateRangeKey, setDateRangeKey] = useState(
    fixedDateRange?.key ?? "ytd",
  );
  const [year, setYear] = useState<number>(
    fixedDateRange?.year ?? new Date().getFullYear(),
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sources, setSources] = useState<SourceToggles>(DEFAULT_SOURCES);
  const [amountCalculation, setAmountCalculation] = useState<"GROSS" | "NET">(
    "NET",
  );
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [segment, setSegment] = useState("");
  const [lapsedDays, setLapsedDays] = useState(90);
  const [sortBy, setSortBy] = useState("DATE");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveVisibility, setSaveVisibility] = useState<
    "PRIVATE" | "ORGANIZATION"
  >("PRIVATE");
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const definition = useMemo(() => {
    const dateRange: Record<string, unknown> =
      fixedDateRange?.key === "year"
        ? { key: "year", year }
        : dateRangeKey === "custom"
          ? { key: "custom", from: customFrom, to: customTo }
          : dateRangeKey === "year"
            ? { key: "year", year }
            : { key: dateRangeKey };

    return {
      reportType,
      dateRange,
      sources,
      amountCalculation,
      columns,
      filters: {
        search: search || undefined,
        minAmountCents: minAmount
          ? Math.round(Number(minAmount) * 100)
          : undefined,
        maxAmountCents: maxAmount
          ? Math.round(Number(maxAmount) * 100)
          : undefined,
        segment: segment || undefined,
        segmentParams:
          segment === "LAPSED" || reportType === "LAPSED"
            ? { lapsedDays }
            : undefined,
      },
      sortBy,
      sortDirection,
      page,
      pageSize,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reportType,
    dateRangeKey,
    year,
    customFrom,
    customTo,
    sources,
    amountCalculation,
    columns,
    search,
    minAmount,
    maxAmount,
    segment,
    lapsedDays,
    sortBy,
    sortDirection,
    page,
  ]);

  const runQuery = useCallback(async () => {
    if (dateRangeKey === "custom" && (!customFrom || !customTo)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/reporting/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(definition),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report.");
      setResult(normalizeResult(data, reportType));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [definition, dateRangeKey, customFrom, customTo, reportType]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const res = await fetch("/api/merchant/reporting/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, definition }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report.${format}`;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="(.+)"/);
      if (match) a.download = match[1];
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Export ready (${format.toUpperCase()})`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) return toast.error("Enter a report name.");
    try {
      const res = await fetch("/api/merchant/reporting/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          visibility: saveVisibility,
          configuration: definition,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save report.");
      toast.success("Report saved");
      setSaveOpen(false);
      setSaveName("");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save report.",
      );
    }
  };

  // Display only: counts filters the user changed. Sources that are off by default (ACH returns, failed payments)
  // are not "active filters" until the user flips them away from the default.
  const sourcesChanged = (
    Object.keys(DEFAULT_SOURCES) as (keyof SourceToggles)[]
  ).filter((k) => sources[k] !== DEFAULT_SOURCES[k]).length;
  const activeFilterCount =
    [search, minAmount, maxAmount, segment].filter(Boolean).length +
    sourcesChanged;

  const totalPages = result
    ? Math.max(1, Math.ceil(result.totalCount / pageSize))
    : 1;
  const currentYear = new Date().getFullYear();
  const periodLabel =
    fixedDateRange?.key === "year" || dateRangeKey === "year"
      ? String(year)
      : dateRangeKey === "custom"
        ? customFrom && customTo
          ? `${customFrom} – ${customTo}`
          : "Pick dates"
        : (DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeKey)?.label ??
          "All Time");
  const showYoY =
    reportType === "ANNUAL" &&
    year === currentYear &&
    columns.includes("previousYearGivingCents");

  const summary = [
    {
      label:
        reportType === "LAPSED"
          ? "Lapsed donors"
          : reportType === "RECURRING"
            ? "Recurring donors"
            : "Donors in report",
      value: result ? result.totalCount.toLocaleString("en-US") : "—",
      hint:
        activeFilterCount > 0 ? "Matching your filters" : "No filters applied",
      icon: <Users className="h-3.5 w-3.5" />,
    },
    reportType === "LAPSED"
      ? {
          label: "Not given in",
          value: `${lapsedDays}+ days`,
          hint: "Change in the filter bar",
          icon: <CalendarRange className="h-3.5 w-3.5" />,
        }
      : {
          label: reportType === "ANNUAL" ? "Calendar year" : "Period",
          value: periodLabel,
          hint:
            reportType === "RECURRING"
              ? "Live subscription data"
              : "Date range of this report",
          icon: <CalendarRange className="h-3.5 w-3.5" />,
        },
    {
      label: "Amounts",
      value: amountCalculation === "NET" ? "Net giving" : "Gross giving",
      hint:
        amountCalculation === "NET"
          ? "After refunds and returns"
          : "Before refunds and returns",
      icon: <Scale className="h-3.5 w-3.5" />,
    },
    {
      label: "Active filters",
      value: activeFilterCount === 0 ? "None" : String(activeFilterCount),
      hint:
        activeFilterCount === 0
          ? "Showing everything"
          : "Clear them from the chips below",
      icon: <Filter className="h-3.5 w-3.5" />,
    },
  ];

  const headerActions = (
    <>
      {!fixedDateRange && (
        <SelectField
          label="Date range"
          value={dateRangeKey}
          onChange={(e) => {
            setDateRangeKey(e.target.value);
            setPage(1);
          }}
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </SelectField>
      )}
      {(dateRangeKey === "year" || fixedDateRange?.key === "year") && (
        <div
          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white shadow-sm"
          role="group"
          aria-label="Year"
        >
          <button
            type="button"
            aria-label="Previous year"
            disabled={year <= 2000}
            onClick={() => setYear(year - 1)}
            className={`h-full rounded-l-xl px-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 ${FOCUS}`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-14 text-center text-sm font-semibold tabular-nums text-slate-900">
            {year}
          </span>
          <button
            type="button"
            aria-label="Next year"
            disabled={year >= 2100}
            onClick={() => setYear(year + 1)}
            className={`h-full rounded-r-xl px-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 ${FOCUS}`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {dateRangeKey === "custom" && !fixedDateRange && (
        <>
          <input
            type="date"
            aria-label="From date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className={`h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ${FOCUS}`}
          />
          <input
            type="date"
            aria-label="To date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className={`h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ${FOCUS}`}
          />
        </>
      )}
      {canExportReports && (
        <div className="relative">
          <ToolButton
            icon={<Download className="h-4 w-4" aria-hidden />}
            disabled={exporting}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((o) => !o)}
          >
            {exporting ? "Exporting…" : "Export"}
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          </ToolButton>
          {exportOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setExportOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
              >
                {(["csv", "xlsx"] as const).map((f) => (
                  <button
                    key={f}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      handleExport(f);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 ${FOCUS}`}
                  >
                    {f === "csv" ? "Download CSV" : "Download Excel"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {canManageSavedReports && (
        <PrimaryButton
          icon={<Save className="h-4 w-4" aria-hidden />}
          onClick={() => setSaveOpen(true)}
        >
          Save report
        </PrimaryButton>
      )}
    </>
  );

  const clearFilters = () => {
    setSearch("");
    setMinAmount("");
    setMaxAmount("");
    setSegment("");
    setSources(DEFAULT_SOURCES);
  };
  const noRows =
    !loading && (Boolean(error) || !result || result.rows.length === 0);
  const emptyNode = error ? (
    <EmptyState
      icon={<X className="h-5 w-5" />}
      title="We couldn't load this report"
      body={error}
      actionLabel="Try again"
      onAction={runQuery}
    />
  ) : activeFilterCount > 0 ? (
    <EmptyState
      icon={<SearchX className="h-5 w-5" />}
      title="No donors match these filters"
      body="Try a wider date range or clear a filter to see more."
      actionLabel="Clear filters"
      onAction={clearFilters}
    />
  ) : reportType === "LAPSED" ? (
    <EmptyState
      icon={<Users className="h-5 w-5" />}
      title="No lapsed donors. Nice!"
      body={`Everyone who has given before has given in the last ${lapsedDays} days.`}
    />
  ) : (
    <EmptyState
      icon={<Users className="h-5 w-5" />}
      title="Nothing to show yet"
      body="Once donors give, they'll show up in this report."
      actionLabel="Back to overview"
      actionHref="/merchant/reporting"
    />
  );

  const colSpan =
    reportType === "RECURRING"
      ? 5
      : columns.length + (reportType === "LAPSED" ? 1 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        current={header.current}
        title={header.title}
        subtitle={header.subtitle}
        actions={headerActions}
      />

      {afterHeader}

      <SummaryStrip items={summary} loading={loading && !result} />

      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white p-2 shadow-sm">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search donors</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, phone…"
              className={`h-10 w-full rounded-xl border border-transparent bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 hover:bg-slate-100 focus:bg-white ${FOCUS}`}
            />
          </label>
          {reportType === "LAPSED" && (
            <SelectField
              label="Lapsed threshold"
              value={lapsedDays}
              onChange={(e) => setLapsedDays(Number(e.target.value))}
            >
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  Lapsed {d}+ days
                </option>
              ))}
            </SelectField>
          )}
          <ToolButton
            icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
            badge={activeFilterCount}
            active={activeFilterCount > 0}
            onClick={() => setFiltersOpen(true)}
          >
            Filters
          </ToolButton>
          {reportType !== "RECURRING" && (
            <ToolButton
              icon={<Columns3 className="h-4 w-4" aria-hidden />}
              onClick={() => setColumnsOpen(true)}
            >
              Columns
            </ToolButton>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {search && (
              <FilterChip
                label={`Search: ${search}`}
                onClear={() => setSearch("")}
              />
            )}
            {segment && (
              <FilterChip
                label={`Segment: ${segment}`}
                onClear={() => setSegment("")}
              />
            )}
            {minAmount && (
              <FilterChip
                label={`Min: $${minAmount}`}
                onClear={() => setMinAmount("")}
              />
            )}
            {maxAmount && (
              <FilterChip
                label={`Max: $${maxAmount}`}
                onClear={() => setMaxAmount("")}
              />
            )}
            {sourcesChanged > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                Some sources hidden
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setMinAmount("");
                setMaxAmount("");
                setSegment("");
                setSources(DEFAULT_SOURCES);
              }}
              className={`rounded px-1 font-semibold text-indigo-700 underline-offset-2 hover:underline ${FOCUS}`}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <section
        aria-label={`${header.title} results`}
        className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm"
      >
        {result?.truncated && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
            This report matched more donors than can be aggregated at once
            (showing the first 5,000). Narrow your date range or filters for a
            complete result.
          </div>
        )}
        <div
          className="max-h-[34rem] overflow-auto"
          tabIndex={0}
          aria-label="Report table, scrollable"
        >
          {noRows ? (
            emptyNode
          ) : (
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                <tr className="border-b border-slate-200">
                  {reportType === "RECURRING" ? (
                    <>
                      <Th first>Donor</Th>
                      <Th align="right">Monthly value</Th>
                      <Th>Frequency</Th>
                      <Th>Status</Th>
                      <Th>Next billing</Th>
                    </>
                  ) : (
                    <>
                      {columns.map((col) => (
                        <Th
                          key={col}
                          first={columns.indexOf(col) === 0}
                          align={
                            CENTS_COLUMNS.has(col) || col === "donationCount"
                              ? "right"
                              : "left"
                          }
                          sortable={sortKeyFor(col) !== null}
                          sorted={
                            sortKeyFor(col) === sortBy ? sortDirection : null
                          }
                          onClick={() =>
                            toggleSort(
                              col,
                              sortBy,
                              sortDirection,
                              setSortBy,
                              setSortDirection,
                            )
                          }
                        >
                          {COLUMN_LABELS[col]}
                        </Th>
                      ))}
                      {reportType === "LAPSED" && (
                        <Th align="right" last>
                          Follow up
                        </Th>
                      )}
                    </>
                  )}
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={8} cols={Math.max(colSpan, 3)} />
              ) : (
                <tbody>
                  {reportType === "RECURRING"
                    ? result!.rows.map((row) => (
                        <ClickableTableRow
                          key={row.donorId}
                          id={row.donorId}
                          targetHref={`/merchant/donors/${row.donorId}`}
                          className="group border-b border-slate-100 transition-colors last:border-0 hover:bg-indigo-50 motion-reduce:transition-none"
                        >
                          <Td first>
                            <DonorCell
                              name={String(row.donorName ?? "—")}
                              donorId={row.donorId}
                            />
                          </Td>
                          <Td align="right" strong>
                            {formatCentsDisplay(
                              Number(row.monthlyValueCents ?? 0),
                            )}
                          </Td>
                          <Td>{String(row.frequencies ?? "—")}</Td>
                          <Td>
                            <StatusPill
                              status={String(row.overallStatus ?? "")}
                            />
                          </Td>
                          <Td muted>
                            {formatDateDisplay(
                              row.nextBillingDate as string | null,
                            )}
                          </Td>
                        </ClickableTableRow>
                      ))
                    : result!.rows.map((row) => (
                        <ClickableTableRow
                          key={row.donorId}
                          id={row.donorId}
                          targetHref={`/merchant/donors/${row.donorId}`}
                          className="group border-b border-slate-100 transition-colors last:border-0 hover:bg-indigo-50 motion-reduce:transition-none"
                        >
                          {columns.map((col) => (
                            <Td
                              key={col}
                              first={columns.indexOf(col) === 0}
                              align={
                                CENTS_COLUMNS.has(col) ||
                                col === "donationCount"
                                  ? "right"
                                  : "left"
                              }
                              strong={
                                col === "periodGivingCents" ||
                                col === "ytdGivingCents"
                              }
                            >
                              {renderCell(row, col, { reportType, showYoY })}
                            </Td>
                          ))}
                          {reportType === "LAPSED" && (
                            <Td align="right" last>
                              <FollowUp
                                email={row.email as string | null | undefined}
                                donorId={row.donorId}
                              />
                            </Td>
                          )}
                        </ClickableTableRow>
                      ))}
                </tbody>
              )}
            </table>
          )}
        </div>

        {/* Pagination */}
        {result && result.totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span className="tabular-nums">
              {((page - 1) * pageSize + 1).toLocaleString("en-US")}–
              {Math.min(page * pageSize, result.totalCount).toLocaleString(
                "en-US",
              )}{" "}
              of {result.totalCount.toLocaleString("en-US")}
            </span>
            {result.totalCount > pageSize && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 ${FOCUS}`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 ${FOCUS}`}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {reportType === "ANNUAL" && !showYoY && (
        <p className="text-xs text-slate-500">
          Tip: add{" "}
          <span className="font-semibold text-slate-700">
            Previous Year Giving
          </span>{" "}
          in Columns to compare each donor with last year (shown for the current
          year).
        </p>
      )}

      {/* Filters drawer */}
      {filtersOpen && (
        <Drawer title="Filters" onClose={() => setFiltersOpen(false)}>
          <div className="space-y-6">
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Donation sources
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {SOURCE_TOGGLE_LABELS.map((s) => (
                  <label
                    key={s.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition motion-reduce:transition-none ${sources[s.key] ? "border-indigo-200 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-indigo-600"
                      checked={sources[s.key]}
                      onChange={(e) =>
                        setSources((prev) => ({
                          ...prev,
                          [s.key]: e.target.checked,
                        }))
                      }
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Amount calculation
              </h4>
              <SegmentedChoice
                label="Amount calculation"
                value={amountCalculation}
                onChange={setAmountCalculation}
                options={[
                  { value: "NET", label: "Net giving" },
                  { value: "GROSS", label: "Gross giving" },
                ]}
              />
              <p className="mt-2 text-xs text-slate-500">
                Net giving = gross giving − refunds − returns.
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Amount range ($)
              </h4>
              <div className="flex gap-2">
                <input
                  aria-label="Minimum amount"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="Min"
                  className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm ${FOCUS}`}
                />
                <input
                  aria-label="Maximum amount"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="Max"
                  className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm ${FOCUS}`}
                />
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Donor segment
              </h4>
              <SelectField
                label="Donor segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full"
              >
                <option value="">All Donors</option>
                <option value="NEW">New Donors</option>
                <option value="RETURNING">Returning Donors</option>
                <option value="RECURRING">Recurring Donors</option>
                <option value="LAPSED">Lapsed Donors</option>
                <option value="MAJOR_DONOR">Major Donors</option>
                <option value="INCREASED_GIVING">Increased Giving</option>
                <option value="DECREASED_GIVING">Decreased Giving</option>
                <option value="ONE_TIME">One-Time Donors</option>
                <option value="MONTHLY_RECURRING">Monthly Recurring</option>
                <option value="WEEKLY_RECURRING">Weekly Recurring</option>
                <option value="FAILED_RECURRING">Failed Recurring</option>
                <option value="NO_EMAIL">No Email</option>
                <option value="NO_ADDRESS">No Mailing Address</option>
                <option value="EXTERNAL_ONLY">External-Only Donors</option>
                <option value="IN_KIND_DONOR">In-Kind Donors</option>
              </SelectField>
            </div>
            <PrimaryButton
              className="w-full justify-center"
              onClick={() => {
                setPage(1);
                setFiltersOpen(false);
              }}
            >
              Apply filters
            </PrimaryButton>
          </div>
        </Drawer>
      )}

      {/* Column customizer */}
      {columnsOpen && (
        <Drawer title="Customize columns" onClose={() => setColumnsOpen(false)}>
          <p className="mb-3 text-xs text-slate-500">
            {columns.length} of {DONOR_REPORT_COLUMNS.length} columns shown.
          </p>
          <div className="grid grid-cols-1 gap-1">
            {DONOR_REPORT_COLUMNS.map((col) => (
              <label
                key={col}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition motion-reduce:transition-none ${columns.includes(col) ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={columns.includes(col)}
                  onChange={(e) => {
                    setColumns((prev) =>
                      e.target.checked
                        ? [...prev, col]
                        : prev.filter((c) => c !== col),
                    );
                  }}
                />
                {COLUMN_LABELS[col]}
              </label>
            ))}
          </div>
        </Drawer>
      )}

      {/* Save report */}
      {saveOpen && (
        <Drawer title="Save report" onClose={() => setSaveOpen(false)}>
          <div className="space-y-5">
            <div>
              <label
                htmlFor="save-report-name"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Report name
              </label>
              <input
                id="save-report-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Board Annual Giving Report"
                className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm ${FOCUS}`}
              />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Who can see it
              </h4>
              <SegmentedChoice
                label="Visibility"
                value={saveVisibility}
                onChange={setSaveVisibility}
                options={[
                  { value: "PRIVATE", label: "Only me" },
                  { value: "ORGANIZATION", label: "Whole team" },
                ]}
              />
            </div>
            <PrimaryButton
              className="w-full justify-center"
              onClick={handleSave}
            >
              Save report
            </PrimaryButton>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function normalizeResult(data: unknown, reportType: string): ReportResult {
  const d = data as Record<string, unknown>;
  if (reportType === "RECURRING") {
    return {
      rows: (d.rows as ReportRow[]) ?? [],
      totalCount: (d.totalCount as number) ?? 0,
      page: 1,
      pageSize: 50,
      truncated: Boolean(d.candidateCapReached),
    };
  }
  return d as unknown as ReportResult;
}

function toggleSort(
  col: string,
  sortBy: string,
  sortDirection: "asc" | "desc",
  setSortBy: (v: string) => void,
  setSortDirection: (v: "asc" | "desc") => void,
) {
  const mapped =
    col === "periodGivingCents"
      ? "AMOUNT"
      : col === "lastDonationDate"
        ? "DATE"
        : col === "donorName"
          ? "DONOR_NAME"
          : col === "lifetimeGivingCents"
            ? "LIFETIME_GIVING"
            : col === "donationCount"
              ? "GIFT_COUNT"
              : null;
  if (!mapped) return;
  if (sortBy === mapped)
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  else setSortBy(mapped);
}

const SORT_KEYS: Partial<Record<Column, string>> = {
  periodGivingCents: "AMOUNT",
  lastDonationDate: "DATE",
  donorName: "DONOR_NAME",
  lifetimeGivingCents: "LIFETIME_GIVING",
  donationCount: "GIFT_COUNT",
};
function sortKeyFor(col: Column): string | null {
  return SORT_KEYS[col] ?? null;
}

/** "3 months ago" style label for a past date. Display only. */
function agoLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  const y = Math.floor(days / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function Th({
  children,
  onClick,
  align = "left",
  sortable,
  sorted,
  first,
  last,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  align?: "left" | "right";
  sortable?: boolean;
  sorted?: "asc" | "desc" | null;
  /** First column stays pinned while the table scrolls sideways. */
  first?: boolean;
  /** Last column (row actions) stays pinned on the right. */
  last?: boolean;
}) {
  const inner = (
    <span
      className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3 text-indigo-600" aria-hidden />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3 text-indigo-600" aria-hidden />
      ) : null}
    </span>
  );
  return (
    <th
      scope="col"
      aria-sort={
        sorted === "asc"
          ? "ascending"
          : sorted === "desc"
            ? "descending"
            : undefined
      }
      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${align === "right" ? "text-right" : "text-left"} ${first ? "sticky left-0 z-20 bg-slate-50" : ""} ${last ? "sticky right-0 z-20 bg-slate-50 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)]" : ""}`}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onClick}
          className={`rounded uppercase tracking-wide hover:text-slate-900 ${FOCUS}`}
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </th>
  );
}

function Td({
  children,
  align = "left",
  strong,
  muted,
  first,
  last,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  strong?: boolean;
  muted?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3.5 ${align === "right" ? "text-right tabular-nums" : ""} ${strong ? "font-semibold text-slate-900" : muted ? "text-slate-500" : "text-slate-700"} ${first ? "sticky left-0 z-[1] bg-white group-hover:bg-indigo-50" : ""} ${last ? "sticky right-0 z-[1] bg-white shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-indigo-50" : ""}`}
    >
      {children}
    </td>
  );
}

function DonorCell({ name, donorId }: { name: string; donorId: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Avatar name={name} />
      <Link
        href={`/merchant/donors/${donorId}`}
        className={`rounded font-semibold text-slate-900 hover:text-indigo-700 hover:underline ${FOCUS}`}
      >
        {name}
      </Link>
    </span>
  );
}

function FollowUp({
  email,
  donorId,
}: {
  email: string | null | undefined;
  donorId: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {email ? (
        <a
          href={`mailto:${email}`}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 ${FOCUS}`}
        >
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Email
        </a>
      ) : (
        <span className="text-xs text-slate-500">No email</span>
      )}
      <Link
        href={`/merchant/donors/${donorId}`}
        className={`inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 ${FOCUS}`}
      >
        View
      </Link>
    </span>
  );
}

/** This-year vs last-year bars with a signed delta. Only used when both figures are present on the row. */
function YoYBars({ current, previous }: { current: number; previous: number }) {
  const max = Math.max(current, previous, 1);
  const delta =
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return (
    <span className="mt-1.5 flex items-center justify-end gap-2">
      <span className="flex w-24 flex-col gap-0.5" aria-hidden>
        <span
          className="h-1.5 rounded-full bg-indigo-600"
          style={{
            width: `${Math.max((current / max) * 100, current > 0 ? 4 : 0)}%`,
          }}
        />
        <span
          className="h-1.5 rounded-full bg-slate-300"
          style={{
            width: `${Math.max((previous / max) * 100, previous > 0 ? 4 : 0)}%`,
          }}
        />
      </span>
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-semibold ${delta === null ? "text-slate-500" : delta > 0 ? "text-emerald-700" : delta < 0 ? "text-rose-700" : "text-slate-500"}`}
      >
        {delta === null ? (
          <Minus className="h-3 w-3" aria-hidden />
        ) : delta > 0 ? (
          <ArrowUp className="h-3 w-3" aria-hidden />
        ) : delta < 0 ? (
          <ArrowDown className="h-3 w-3" aria-hidden />
        ) : (
          <Minus className="h-3 w-3" aria-hidden />
        )}
        {delta === null ? "new" : `${delta > 0 ? "+" : ""}${delta}%`}
        <span className="sr-only"> compared with last year</span>
      </span>
    </span>
  );
}

function renderCell(
  row: ReportRow,
  col: Column,
  ctx: { reportType: string; showYoY: boolean },
): React.ReactNode {
  const v = row[col];
  if (col === "donorName")
    return <DonorCell name={String(v ?? "—")} donorId={row.donorId} />;
  if (col === "isRecurringDonor") {
    return v === true ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
        Recurring
      </span>
    ) : (
      <span className="text-slate-500">—</span>
    );
  }
  if (
    col === "lastDonationDate" &&
    ctx.reportType === "LAPSED" &&
    typeof v === "string"
  ) {
    return (
      <span className="flex flex-col">
        <span className="font-semibold text-slate-900">
          Last gave {agoLabel(v)}
        </span>
        <span className="text-xs text-slate-500">{formatDateDisplay(v)}</span>
      </span>
    );
  }
  if (
    col === "periodGivingCents" &&
    ctx.showYoY &&
    typeof v === "number" &&
    typeof row.previousYearGivingCents === "number"
  ) {
    return (
      <span className="flex flex-col items-end">
        <span>{formatCentsDisplay(v)}</span>
        <YoYBars current={v} previous={row.previousYearGivingCents} />
      </span>
    );
  }
  if (v === null || v === undefined || v === "—")
    return <span className="text-slate-500">—</span>;
  return cellValue(row, col);
}

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 ${FOCUS}`}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
