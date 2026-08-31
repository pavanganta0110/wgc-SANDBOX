import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import BarChart from "@/components/merchant/BarChart";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import TrendFilter from "@/components/merchant/TrendFilter";
import CustomizeSummaryPanel from "@/components/merchant/CustomizeSummaryPanel";
import { computeSummaryMetrics, DEFAULT_METRICS, METRIC_LABELS } from "@/lib/reports/summaryMetrics";
import {
  aggregateTransfers,
  aggregateDisputes,
  aggregateRefunds,
  aggregateAuthorizations,
  aggregateDeposits,
  getTransferVolumeTrend,
  getSettlementTrend,
  getDepositTrend,
  type TrendBucket,
} from "@/lib/reports/dashboardAggregates";
import { resolveDateRange } from "@/lib/dateRangePresets";
import QuickLinksPanel from "@/components/merchant/QuickLinksPanel";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope, buildRefundScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

const CENTRAL_TIME_ZONE = "America/Chicago";

const TREND_CONFIG: Record<string, { buckets: number; stepDays: number; format: Intl.DateTimeFormatOptions }> = {
  daily: { buckets: 14, stepDays: 1, format: { month: "short", day: "numeric" } },
  weekly: { buckets: 6, stepDays: 7, format: { month: "short", day: "numeric" } },
  monthly: { buckets: 6, stepDays: 30, format: { month: "short" } },
};

// Central-time calendar-month boundaries — a fixed 30-day step drifts
// against real months (a 31-day month pushes every later bucket a day
// earlier), which visibly duplicated "Jul" as two different buckets with
// different data. Months have no fixed length, so they can't be stepped
// like days/weeks can. Mirrors src/lib/reports/insightsData.ts's fix for
// the same underlying bug.
function startOfMonthCentral(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  // Noon UTC keeps this safely within the 1st in Central time regardless of
  // CST/CDT offset (at most UTC-6) — startOfDayCentral then re-derives the
  // true Central midnight from it.
  return startOfDayCentral(new Date(Date.UTC(year, month - 1, 1, 12)));
}

/**
 * Bucket windows for the trend charts — always "last N days/weeks/months
 * from now," independent of the summary section's own date-range picker
 * (which only bounds the summary tiles). Each window is handed to the
 * database as its own indexed aggregate query (see dashboardAggregates.ts)
 * rather than fetched as rows and summed in JS.
 */
function computeTrendBuckets(trend: string): TrendBucket[] {
  const config = TREND_CONFIG[trend] ?? TREND_CONFIG.weekly;
  const now = new Date();
  const buckets: TrendBucket[] = [];

  for (let i = config.buckets - 1; i >= 0; i--) {
    let periodStart: Date;
    let periodEnd: Date;
    if (trend === "monthly") {
      const anchor = startOfMonthCentral(now);
      periodStart = new Date(anchor);
      periodStart.setMonth(periodStart.getMonth() - i);
      periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      const dayOffset = new Date(now);
      dayOffset.setDate(now.getDate() - i * config.stepDays);
      periodStart = startOfDayCentral(dayOffset);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + config.stepDays);
    }

    buckets.push({
      start: periodStart,
      end: periodEnd,
      label: periodStart.toLocaleDateString("en-US", { ...config.format, timeZone: CENTRAL_TIME_ZONE }),
    });
  }

  return buckets;
}

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; trend?: string; metrics?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  const churchId = auth.churchId;
  const {
    range: rangeParam,
    from: fromParam,
    to: toParam,
    trend: trendParam,
    metrics: metricsParam,
  } = await searchParams;
  const trend = trendParam && TREND_CONFIG[trendParam] ? trendParam : "weekly";
  const selectedMetrics = metricsParam
    ? metricsParam.split(",").filter((key) => METRIC_LABELS[key])
    : DEFAULT_METRICS;
  const { from: startDate, to: endDate } = resolveDateRange(rangeParam, fromParam, toParam);
  const dateFilter =
    startDate && endDate ? { gte: startDate, lte: endDate } : startDate ? { gte: startDate } : undefined;

  // Team-access: transfers/refunds bridge through Payment.attributedUserId
  // for a user-scoped view (buildFinixTransferScope/buildRefundScope, same
  // helpers used by the payments/refunds pages). Disputes/authorizations/
  // settlements/deposits have no reliable per-user attribution (per the
  // established CP4C policy) and stay organization-wide regardless of scope.
  const viewScope = await resolveViewScope(auth);
  const [transferScope, refundScope] = await Promise.all([
    buildFinixTransferScope(auth, viewScope),
    buildRefundScope(auth, viewScope),
  ]);

  const orgScopeWithDate = { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) };

  const [transfers, disputes, refunds, authorizations, deposits] = await Promise.all([
    aggregateTransfers({ ...transferScope, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) }),
    aggregateDisputes(orgScopeWithDate),
    aggregateRefunds({ ...refundScope, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) }),
    aggregateAuthorizations(orgScopeWithDate),
    aggregateDeposits(orgScopeWithDate),
  ]);

  const metricValues = computeSummaryMetrics({ transfers, disputes, refunds, authorizations, deposits });
  const row1Metrics = selectedMetrics.slice(0, 4);
  const row2Metrics = selectedMetrics.slice(4, 8);

  const trendBuckets = computeTrendBuckets(trend);
  
  const [volumeSums, settlementSums, depositSums] = await Promise.all([
    getTransferVolumeTrend(transferScope, trendBuckets),
    getSettlementTrend({ churchId }, trendBuckets),
    getDepositTrend({ churchId }, trendBuckets),
  ]);
  const volumeTrend = trendBuckets.map((b, i) => ({ label: b.label, value: volumeSums[i] }));
  const settlementTrend = trendBuckets.map((b, i) => ({ label: b.label, value: settlementSums[i] }));
  const depositTrend = trendBuckets.map((b, i) => ({ label: b.label, value: depositSums[i] }));

  const lastUpdated = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
        <p className="text-sm text-slate-500">This page last updated at {lastUpdated}</p>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-grow min-w-0 space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Summary</p>
          <div className="flex items-center gap-2">
            <CustomizeSummaryPanel />
            <DateRangePicker />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {row1Metrics.map((key) => (
            <div key={key} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {METRIC_LABELS[key]}
              </p>
              <p className="text-2xl font-bold text-slate-900">{metricValues[key]}</p>
            </div>
          ))}
        </div>
        {row2Metrics.length > 0 && (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
            {row2Metrics.map((key) => (
              <div key={key} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {METRIC_LABELS[key]}
                </p>
                <p className="text-2xl font-bold text-slate-900">{metricValues[key]}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Trends</p>
          <TrendFilter />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Total Transaction Volume and Count</h3>
          <BarChart data={volumeTrend} formatValue={(n) => `$${n.toFixed(0)}`} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Authorization Rate</h3>
        {authorizations.totalCount === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-slate-400">
            No results yet
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <p className="text-3xl font-bold text-slate-900">
              {((authorizations.succeededCount / authorizations.totalCount) * 100).toFixed(1)}%
            </p>
            <p className="text-sm text-slate-500">
              {authorizations.succeededCount} of {authorizations.totalCount} authorizations approved
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Settlement Volume (Weekly)</h3>
        <BarChart data={settlementTrend} formatValue={(n) => `$${n.toFixed(0)}`} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Merchant Deposits (Weekly)</h3>
        <BarChart data={depositTrend} formatValue={(n) => `$${n.toFixed(0)}`} />
      </div>
        </div>

        <div className="w-80 shrink-0 hidden lg:block">
          <QuickLinksPanel />
        </div>
      </div>
    </div>
  );
}
