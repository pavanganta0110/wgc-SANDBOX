"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Download, Save, SlidersHorizontal, Columns3, X } from "lucide-react";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";

const DONOR_REPORT_COLUMNS = [
  "donorName", "firstName", "lastName", "email", "phone", "companyName", "address", "city", "state", "postalCode",
  "firstDonationDate", "lastDonationDate", "donationCount", "averageDonationCents", "largestDonationCents", "smallestDonationCents",
  "ytdGivingCents", "previousYearGivingCents", "periodGivingCents", "lifetimeGivingCents",
  "cardGivingCents", "achGivingCents", "externalGivingCents", "cashGivingCents", "checkGivingCents", "inKindValueCents",
  "refundedAmountCents", "returnedAmountCents", "isRecurringDonor", "recurringAmountCents", "givingFrequency",
  "givingPage", "fund", "purpose", "attributedUserName",
] as const;
type Column = (typeof DONOR_REPORT_COLUMNS)[number];

const COLUMN_LABELS: Record<Column, string> = {
  donorName: "Donor Name", firstName: "First Name", lastName: "Last Name", email: "Email", phone: "Phone",
  companyName: "Company/Organization", address: "Address", city: "City", state: "State", postalCode: "ZIP",
  firstDonationDate: "First Donation Date", lastDonationDate: "Most Recent Donation Date", donationCount: "# Donations",
  averageDonationCents: "Average Donation", largestDonationCents: "Largest Donation", smallestDonationCents: "Smallest Donation",
  ytdGivingCents: "YTD Giving", previousYearGivingCents: "Previous Year Giving", periodGivingCents: "Selected Period Giving",
  lifetimeGivingCents: "Lifetime Giving", cardGivingCents: "Card Giving", achGivingCents: "ACH Giving",
  externalGivingCents: "External Giving", cashGivingCents: "Cash Giving", checkGivingCents: "Check Giving",
  inKindValueCents: "In-Kind Value", refundedAmountCents: "Refunded", returnedAmountCents: "Returned",
  isRecurringDonor: "Recurring Donor", recurringAmountCents: "Recurring Amount", givingFrequency: "Giving Frequency",
  givingPage: "Giving Page", fund: "Fund", purpose: "Purpose", attributedUserName: "Assigned Fundraiser",
};

const CENTS_COLUMNS = new Set<Column>(["averageDonationCents", "largestDonationCents", "smallestDonationCents", "ytdGivingCents", "previousYearGivingCents", "periodGivingCents", "lifetimeGivingCents", "cardGivingCents", "achGivingCents", "externalGivingCents", "cashGivingCents", "checkGivingCents", "inKindValueCents", "refundedAmountCents", "returnedAmountCents", "recurringAmountCents"]);
const DATE_COLUMNS = new Set<Column>(["firstDonationDate", "lastDonationDate"]);

const DEFAULT_COLUMNS: Column[] = ["donorName", "email", "lastDonationDate", "donationCount", "periodGivingCents", "lifetimeGivingCents", "isRecurringDonor"];

const DATE_RANGE_OPTIONS = [
  { key: "today", label: "Today" }, { key: "this_week", label: "This Week" }, { key: "mtd", label: "This Month" },
  { key: "qtd", label: "This Quarter" }, { key: "ytd", label: "Year to Date" }, { key: "last_year", label: "Last Year" },
  { key: "30d", label: "Previous 30 Days" }, { key: "90d", label: "Previous 90 Days" }, { key: "12m", label: "Previous 12 Months" },
  { key: "year", label: "Calendar Year..." }, { key: "custom", label: "Custom Range..." }, { key: "all", label: "All Time" },
];

const SOURCE_TOGGLE_LABELS: { key: keyof SourceToggles; label: string }[] = [
  { key: "card", label: "Card" }, { key: "ach", label: "ACH" }, { key: "external", label: "External/Manual" },
  { key: "cash", label: "Cash" }, { key: "check", label: "Check" }, { key: "inKind", label: "In-Kind Gifts" },
  { key: "recurring", label: "Recurring" }, { key: "oneTime", label: "One-Time" }, { key: "refunded", label: "Refunded" },
  { key: "achReturns", label: "ACH Returns" }, { key: "failedPayments", label: "Failed Payments" }, { key: "anonymous", label: "Anonymous Gifts" },
];

interface SourceToggles {
  card: boolean; ach: boolean; external: boolean; cash: boolean; check: boolean; inKind: boolean;
  recurring: boolean; oneTime: boolean; refunded: boolean; achReturns: boolean; failedPayments: boolean; anonymous: boolean;
}
const DEFAULT_SOURCES: SourceToggles = { card: true, ach: true, external: true, cash: true, check: true, inKind: true, recurring: true, oneTime: true, refunded: true, achReturns: false, failedPayments: false, anonymous: true };

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
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function formatDateDisplay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function cellValue(row: ReportRow, col: Column): string {
  const v = row[col];
  if (v === null || v === undefined) return "—";
  if (CENTS_COLUMNS.has(col)) return formatCentsDisplay(v as number);
  if (DATE_COLUMNS.has(col)) return formatDateDisplay(v as string);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function ReportExplorer({
  reportType,
  fixedDateRange,
  canManageSavedReports,
  canExportReports,
}: {
  reportType: "DONORS" | "ANNUAL" | "LAPSED" | "RECURRING";
  fixedDateRange?: { key: string; year?: number };
  canManageSavedReports: boolean;
  canExportReports: boolean;
}) {
  const [dateRangeKey, setDateRangeKey] = useState(fixedDateRange?.key ?? "ytd");
  const [year, setYear] = useState<number>(fixedDateRange?.year ?? new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sources, setSources] = useState<SourceToggles>(DEFAULT_SOURCES);
  const [amountCalculation, setAmountCalculation] = useState<"GROSS" | "NET">("NET");
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
  const [saveVisibility, setSaveVisibility] = useState<"PRIVATE" | "ORGANIZATION">("PRIVATE");
  const [exporting, setExporting] = useState(false);

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
        minAmountCents: minAmount ? Math.round(Number(minAmount) * 100) : undefined,
        maxAmountCents: maxAmount ? Math.round(Number(maxAmount) * 100) : undefined,
        segment: segment || undefined,
        segmentParams: segment === "LAPSED" || reportType === "LAPSED" ? { lapsedDays } : undefined,
      },
      sortBy,
      sortDirection,
      page,
      pageSize,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, dateRangeKey, year, customFrom, customTo, sources, amountCalculation, columns, search, minAmount, maxAmount, segment, lapsedDays, sortBy, sortDirection, page]);

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
        body: JSON.stringify({ name: saveName.trim(), visibility: saveVisibility, configuration: definition }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save report.");
      toast.success("Report saved");
      setSaveOpen(false);
      setSaveName("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save report.");
    }
  };

  const activeFilterCount = [search, minAmount, maxAmount, segment].filter(Boolean).length + Object.values(sources).filter((v) => v === false).length;

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2">
        {!fixedDateRange && (
          <select
            value={dateRangeKey}
            onChange={(e) => {
              setDateRangeKey(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white"
          >
            {DATE_RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {(dateRangeKey === "year" || fixedDateRange?.key === "year") && (
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-xl border border-slate-200 text-sm"
            min={2000}
            max={2100}
          />
        )}
        {dateRangeKey === "custom" && !fixedDateRange && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          </>
        )}
        {reportType === "LAPSED" && (
          <select value={lapsedDays} onChange={(e) => setLapsedDays(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                Lapsed {d}+ days
              </option>
            ))}
          </select>
        )}
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name, email, phone..."
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm flex-1 min-w-[180px]"
        />
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white hover:bg-slate-50"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-900 text-white text-xs">{activeFilterCount}</span>}
        </button>
        {reportType !== "RECURRING" && (
          <button onClick={() => setColumnsOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white hover:bg-slate-50">
            <Columns3 className="w-4 h-4" />
            Columns
          </button>
        )}
        {canManageSavedReports && (
          <button onClick={() => setSaveOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white hover:bg-slate-50">
            <Save className="w-4 h-4" />
            Save Report
          </button>
        )}
        {canExportReports && (
          <div className="flex items-center gap-1 ml-auto">
            <button disabled={exporting} onClick={() => handleExport("csv")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button disabled={exporting} onClick={() => handleExport("xlsx")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
              <Download className="w-4 h-4" />
              Excel
            </button>
          </div>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold">Active filters:</span>
          {search && <FilterChip label={`Search: ${search}`} onClear={() => setSearch("")} />}
          {segment && <FilterChip label={`Segment: ${segment}`} onClear={() => setSegment("")} />}
          {minAmount && <FilterChip label={`Min: $${minAmount}`} onClear={() => setMinAmount("")} />}
          {maxAmount && <FilterChip label={`Max: $${maxAmount}`} onClear={() => setMaxAmount("")} />}
          <button
            onClick={() => {
              setSearch("");
              setMinAmount("");
              setMaxAmount("");
              setSegment("");
              setSources(DEFAULT_SOURCES);
            }}
            className="underline"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {result?.truncated && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
            This report matched more donors than can be aggregated at once (showing the first 5,000). Narrow your date range or filters for a complete result.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {reportType === "RECURRING" ? (
                  <>
                    <Th>Donor</Th>
                    <Th>Amount</Th>
                    <Th>Frequency</Th>
                    <Th>Status</Th>
                    <Th>Next Billing</Th>
                  </>
                ) : (
                  columns.map((col) => (
                    <Th key={col} onClick={() => toggleSort(col, sortBy, sortDirection, setSortBy, setSortDirection)}>
                      {COLUMN_LABELS[col]}
                    </Th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : !result || result.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                    No results for this report.
                  </td>
                </tr>
              ) : reportType === "RECURRING" ? (
                result.rows.map((row) => (
                  <ClickableTableRow
                    key={row.donorId}
                    id={row.donorId}
                    targetHref={`/merchant/donors/${row.donorId}`}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">{String(row.donorName ?? "—")}</td>
                    <td className="px-4 py-3">{formatCentsDisplay(Number(row.monthlyValueCents ?? 0))}</td>
                    <td className="px-4 py-3">{String(row.frequencies ?? "—")}</td>
                    <td className="px-4 py-3">{String(row.overallStatus ?? "—")}</td>
                    <td className="px-4 py-3">{formatDateDisplay(row.nextBillingDate as string | null)}</td>
                  </ClickableTableRow>
                ))
              ) : (
                result.rows.map((row) => (
                  <ClickableTableRow
                    key={row.donorId}
                    id={row.donorId}
                    targetHref={`/merchant/donors/${row.donorId}`}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {cellValue(row, col)}
                      </td>
                    ))}
                  </ClickableTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {result && result.totalCount > pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {Math.ceil(result.totalCount / pageSize)} ({result.totalCount} total)
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">
              Previous
            </button>
            <button disabled={page >= Math.ceil(result.totalCount / pageSize)} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Filters drawer */}
      {filtersOpen && (
        <Drawer title="Filters" onClose={() => setFiltersOpen(false)}>
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Donation Sources</h4>
              <div className="grid grid-cols-2 gap-2">
                {SOURCE_TOGGLE_LABELS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sources[s.key]} onChange={(e) => setSources((prev) => ({ ...prev, [s.key]: e.target.checked }))} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Amount Calculation</h4>
              <div className="flex gap-2">
                {(["GROSS", "NET"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmountCalculation(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${amountCalculation === v ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}
                  >
                    {v === "GROSS" ? "Gross Giving" : "Net Giving"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Net Giving = Gross Giving − Refunds − Returns.</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Amount Range ($)</h4>
              <div className="flex gap-2">
                <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Donor Segment</h4>
              <select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
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
              </select>
            </div>
            <button
              onClick={() => {
                setPage(1);
                setFiltersOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Apply Filters
            </button>
          </div>
        </Drawer>
      )}

      {/* Column customizer */}
      {columnsOpen && (
        <Drawer title="Customize Columns" onClose={() => setColumnsOpen(false)}>
          <div className="space-y-1">
            {DONOR_REPORT_COLUMNS.map((col) => (
              <label key={col} className="flex items-center gap-2 text-sm py-1">
                <input
                  type="checkbox"
                  checked={columns.includes(col)}
                  onChange={(e) => {
                    setColumns((prev) => (e.target.checked ? [...prev, col] : prev.filter((c) => c !== col)));
                  }}
                />
                {COLUMN_LABELS[col]}
              </label>
            ))}
          </div>
        </Drawer>
      )}

      {/* Save report modal */}
      {saveOpen && (
        <Drawer title="Save Report" onClose={() => setSaveOpen(false)}>
          <div className="space-y-3">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Board Annual Giving Report" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <div className="flex gap-2">
              {(["PRIVATE", "ORGANIZATION"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSaveVisibility(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${saveVisibility === v ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}
                >
                  {v === "PRIVATE" ? "Only Me" : "Whole Team"}
                </button>
              ))}
            </div>
            <button onClick={handleSave} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
              Save Report
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function normalizeResult(data: unknown, reportType: string): ReportResult {
  const d = data as Record<string, unknown>;
  if (reportType === "RECURRING") {
    return { rows: (d.rows as ReportRow[]) ?? [], totalCount: (d.totalCount as number) ?? 0, page: 1, pageSize: 50, truncated: Boolean(d.candidateCapReached) };
  }
  return d as unknown as ReportResult;
}

function toggleSort(col: string, sortBy: string, sortDirection: "asc" | "desc", setSortBy: (v: string) => void, setSortDirection: (v: "asc" | "desc") => void) {
  const mapped = col === "periodGivingCents" ? "AMOUNT" : col === "lastDonationDate" ? "DATE" : col === "donorName" ? "DONOR_NAME" : col === "lifetimeGivingCents" ? "LIFETIME_GIVING" : col === "donationCount" ? "GIFT_COUNT" : null;
  if (!mapped) return;
  if (sortBy === mapped) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  else setSortBy(mapped);
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th onClick={onClick} className={`px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap ${onClick ? "cursor-pointer select-none" : ""}`}>
      {children}
    </th>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100">
      {label}
      <button onClick={onClear}>
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-xl p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
