import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import BarChart from "@/components/merchant/BarChart";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import TrendFilter from "@/components/merchant/TrendFilter";
import CustomizeSummaryPanel from "@/components/merchant/CustomizeSummaryPanel";
import { computeSummaryMetrics, DEFAULT_METRICS, METRIC_LABELS } from "@/lib/reports/summaryMetrics";
import { resolveDateRange } from "@/lib/dateRangePresets";
import QuickLinksPanel from "@/components/merchant/QuickLinksPanel";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";

const CENTRAL_TIME_ZONE = "America/Chicago";

const TREND_CONFIG: Record<string, { buckets: number; stepDays: number; format: Intl.DateTimeFormatOptions }> = {
  daily: { buckets: 14, stepDays: 1, format: { month: "short", day: "numeric" } },
  weekly: { buckets: 6, stepDays: 7, format: { month: "short", day: "numeric" } },
  monthly: { buckets: 6, stepDays: 30, format: { month: "short" } },
};

function groupByPeriod(
  records: { createdAtFinix: Date | null; amountCents: number | null }[],
  trend: string
) {
  const config = TREND_CONFIG[trend] ?? TREND_CONFIG.weekly;
  const now = new Date();
  const buckets: { label: string; value: number }[] = [];

  for (let i = config.buckets - 1; i >= 0; i--) {
    const dayOffset = new Date(now);
    dayOffset.setDate(now.getDate() - i * config.stepDays);
    const periodStart = startOfDayCentral(dayOffset);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + config.stepDays);

    const total = records
      .filter(
        (r) => r.createdAtFinix && r.createdAtFinix >= periodStart && r.createdAtFinix < periodEnd
      )
      .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

    buckets.push({
      label: periodStart.toLocaleDateString("en-US", { ...config.format, timeZone: CENTRAL_TIME_ZONE }),
      value: total / 100,
    });
  }

  return buckets;
}

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; trend?: string; metrics?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
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

  const [transfers, disputes, refunds, authorizations, settlements, deposits] = await Promise.all([
    prisma.finixTransfer.findMany({
      where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    }),
    prisma.finixDispute.findMany({
      where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    }),
    prisma.finixRefundOrReversal.findMany({
      where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    }),
    prisma.finixAuthorization.findMany({
      where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    }),
    prisma.finixSettlement.findMany({
      where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    }),
    prisma.finixFundingTransferAttempt.findMany({
      where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
    }),
  ]);

  const succeeded = transfers.filter((t) => (t.state || "").toUpperCase() === "SUCCEEDED");

  const approvedAuths = authorizations.filter((a) => (a.state || "").toUpperCase() === "SUCCEEDED");
  const authorizationRate =
    authorizations.length > 0 ? (approvedAuths.length / authorizations.length) * 100 : null;

  const metricValues = computeSummaryMetrics({
    transfers,
    disputes,
    refunds,
    authorizations,
    deposits,
  });
  const row1Metrics = selectedMetrics.slice(0, 4);
  const row2Metrics = selectedMetrics.slice(4, 8);

  const volumeTrend = groupByPeriod(succeeded, trend);
  const settlementTrend = groupByPeriod(
    settlements.map((s) => ({ createdAtFinix: s.createdAtFinix, amountCents: s.totalAmountCents })),
    trend
  );
  const depositTrend = groupByPeriod(deposits, trend);

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
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
        {authorizations.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-slate-400">
            No results yet
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <p className="text-3xl font-bold text-slate-900">{authorizationRate!.toFixed(1)}%</p>
            <p className="text-sm text-slate-500">
              {approvedAuths.length} of {authorizations.length} authorizations approved
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
