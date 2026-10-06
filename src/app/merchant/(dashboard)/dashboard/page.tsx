import { redirect } from "next/navigation";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import CustomizeSummaryPanel from "@/components/merchant/CustomizeSummaryPanel";
import { Suspense, type ReactNode } from "react";
import type { Prisma } from "@prisma/client";
import {
  DollarSign,
  Receipt,
  ShieldAlert,
  Undo2,
  Hash,
  Percent,
  ShieldCheck,
  Landmark,
  Activity,
  XCircle,
} from "lucide-react";
import {
  computeSummaryMetrics,
  computeSummaryNumbers,
  computeMetricDelta,
  DEFAULT_METRICS,
  METRIC_LABELS,
  METRIC_META,
} from "@/lib/reports/summaryMetrics";
import {
  aggregateWindows,
  previousWindow,
  splitWindow,
  getAttentionCounts,
  buildAttentionItems,
  describeAuthRate,
  getTopDonors,
  getDonorGrowth,
  getRecentActivity,
} from "@/lib/reports/dashboardHome";
import { getSourceTotals } from "@/lib/reports/moneySources";
import { resolveScopedTransferIds } from "@/lib/reports/insightsData";
import { prisma } from "@/lib/prisma";
import KpiCard from "@/components/merchant/dashboard/KpiCard";
import AttentionStrip from "@/components/merchant/dashboard/AttentionStrip";
import VolumeAreaChart from "@/components/merchant/dashboard/VolumeAreaChart";
import MiniBarChart from "@/components/merchant/dashboard/MiniBarChart";
import TrendToggle from "@/components/merchant/dashboard/TrendToggle";
import AuthRateMeter from "@/components/merchant/dashboard/AuthRateMeter";
import SourcesCard from "@/components/merchant/dashboard/SourcesCard";
import TopDonorsCard from "@/components/merchant/dashboard/TopDonorsCard";
import DonorGrowthChart from "@/components/merchant/dashboard/DonorGrowthChart";
import ActivityFeed from "@/components/merchant/dashboard/ActivityFeed";
import QuickActions from "@/components/merchant/dashboard/QuickActions";
import { CardSkeleton } from "@/components/merchant/dashboard/Skeletons";
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
import { resolveDateRange, rangeLabel } from "@/lib/dateRangePresets";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope, buildRefundScope, buildPaymentScope, resolveScopedUserId } from "@/lib/auth/scopes";
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

const METRIC_ICONS: Record<string, ReactNode> = {
  totalTransactionVolume: <DollarSign className="h-4 w-4" />,
  avgTransactionAmount: <Receipt className="h-4 w-4" />,
  totalDisputeVolume: <ShieldAlert className="h-4 w-4" />,
  totalRefundVolume: <Undo2 className="h-4 w-4" />,
  totalTransactionCount: <Hash className="h-4 w-4" />,
  totalDisputeCount: <ShieldAlert className="h-4 w-4" />,
  activeDisputeCount: <ShieldAlert className="h-4 w-4" />,
  disputeRate: <Percent className="h-4 w-4" />,
  successfulRefundCount: <Undo2 className="h-4 w-4" />,
  successfulRefundVolume: <Undo2 className="h-4 w-4" />,
  failedRefundCount: <XCircle className="h-4 w-4" />,
  failedRefundVolume: <XCircle className="h-4 w-4" />,
  authorizationRate: <ShieldCheck className="h-4 w-4" />,
  authorizationRequestCount: <Activity className="h-4 w-4" />,
  authorizationRequestVolume: <Activity className="h-4 w-4" />,
  voidedAuthorizationCount: <XCircle className="h-4 w-4" />,
  voidedAuthorizationVolume: <XCircle className="h-4 w-4" />,
  totalDeposits: <Landmark className="h-4 w-4" />,
};

const TREND_CAPTION: Record<string, string> = {
  daily: "Last 14 days",
  weekly: "Last 6 weeks",
  monthly: "Last 6 months",
};

const SPARKLINE_BUCKETS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

function greetingFor(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: CENTRAL_TIME_ZONE }).format(date)
  );
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`wgc-fade-in rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

async function SourcesSection({
  churchId,
  dateFilter,
  attributedUserId,
  insightsHref,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  attributedUserId?: string;
  insightsHref: string;
}) {
  const totals = await getSourceTotals(churchId, dateFilter, attributedUserId);
  return (
    <Card>
      <SourcesCard totals={totals} insightsHref={insightsHref} />
    </Card>
  );
}

async function DonorsSection({
  churchId,
  dateFilter,
  attributedUserId,
  buckets,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  attributedUserId?: string;
  buckets: TrendBucket[];
}) {
  const [donors, growth] = await Promise.all([
    getTopDonors({ churchId, attributedUserId, dateFilter }),
    getDonorGrowth({ churchId, attributedUserId, buckets }),
  ]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <TopDonorsCard donors={donors} />
      </Card>
      <Card>
        <DonorGrowthChart data={growth} />
      </Card>
    </div>
  );
}

async function ActivitySection({
  churchId,
  paymentScope,
  attributedUserId,
}: {
  churchId: string;
  paymentScope: Prisma.PaymentWhereInput;
  attributedUserId?: string;
}) {
  const items = await getRecentActivity({
    churchId,
    paymentScope,
    attributedUserId,
    // Registrations have no per-user attribution, so a team view omits them.
    includeRegistrations: !attributedUserId,
  });
  return (
    <Card>
      <ActivityFeed items={items} />
    </Card>
  );
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
  const selectedMetrics = (
    metricsParam ? metricsParam.split(",").filter((key) => METRIC_LABELS[key]) : DEFAULT_METRICS
  ).slice(0, 8);
  const { from: startDate, to: endDate } = resolveDateRange(rangeParam, fromParam, toParam);
  const dateFilter =
    startDate && endDate ? { gte: startDate, lte: endDate } : startDate ? { gte: startDate } : undefined;

  // Team-access: transfers/refunds bridge through Payment.attributedUserId
  // for a user-scoped view (buildFinixTransferScope/buildRefundScope, same
  // helpers used by the payments/refunds pages). Disputes/authorizations/
  // settlements/deposits have no reliable per-user attribution (per the
  // established CP4C policy) and stay organization-wide regardless of scope.
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;
  const [transferScope, refundScope] = await Promise.all([
    buildFinixTransferScope(auth, viewScope),
    buildRefundScope(auth, viewScope),
  ]);

  const orgScopeWithDate = { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) };

  // Previous period: the equal-length window right before the selected one.
  // Only exists for a bounded range ("all time" has nothing to compare to).
  const now = new Date();
  const currentEnd = endDate ?? now;
  const prior = startDate ? previousWindow(startDate, new Date(currentEnd.getTime() + 1)) : null;
  const priorFilter = prior ? { gte: prior.start, lt: prior.end } : undefined;

  const [transfers, disputes, refunds, authorizations, deposits] = await Promise.all([
    aggregateTransfers({ ...transferScope, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) }),
    aggregateDisputes(orgScopeWithDate),
    aggregateRefunds({ ...refundScope, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) }),
    aggregateAuthorizations(orgScopeWithDate),
    aggregateDeposits(orgScopeWithDate),
  ]);

  const trendBuckets = computeTrendBuckets(trend);
  const sparkWindows = splitWindow(
    startDate ?? new Date(now.getTime() - SPARKLINE_BUCKETS * 7 * DAY_MS),
    new Date(currentEnd.getTime() + 1),
    SPARKLINE_BUCKETS
  );

  const [
    previous,
    sparkBuckets,
    volumeSums,
    settlementSums,
    depositSums,
    attentionCounts,
    church,
    pricing,
  ] = await Promise.all([
    priorFilter
      ? Promise.all([
          aggregateTransfers({ ...transferScope, createdAtFinix: priorFilter }),
          aggregateDisputes({ churchId, createdAtFinix: priorFilter }),
          aggregateRefunds({ ...refundScope, createdAtFinix: priorFilter }),
          aggregateAuthorizations({ churchId, createdAtFinix: priorFilter }),
          aggregateDeposits({ churchId, createdAtFinix: priorFilter }),
        ])
      : Promise.resolve(null),
    aggregateWindows({ churchId, attributedUserId: scopedUserId, windows: sparkWindows }),
    getTransferVolumeTrend(transferScope, trendBuckets),
    getSettlementTrend({ churchId }, trendBuckets),
    getDepositTrend({ churchId }, trendBuckets),
    resolveScopedTransferIds(churchId, scopedUserId).then((scopedTransferIds) =>
      getAttentionCounts({
        churchId,
        dateFilter,
        transferScope,
        failedRefundCount: refunds.failedCount,
        scopedTransferIds,
      })
    ),
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true, finixMerchantId: true } }),
    prisma.churchPricing.findUnique({ where: { churchId } }),
  ]);

  const currentInputs = { transfers, disputes, refunds, authorizations, deposits };
  const metricValues = computeSummaryMetrics(currentInputs);
  const metricNumbers = computeSummaryNumbers(currentInputs);
  const previousNumbers = previous
    ? computeSummaryNumbers({
        transfers: previous[0],
        disputes: previous[1],
        refunds: previous[2],
        authorizations: previous[3],
        deposits: previous[4],
      })
    : null;

  // Sparklines only where there is real per-bucket data to draw.
  const sparkFor: Record<string, number[]> = {
    totalTransactionVolume: sparkBuckets.map((b) => b.volumeCents),
    avgTransactionAmount: sparkBuckets.map((b) => (b.count > 0 ? b.volumeCents / b.count : 0)),
  };

  const volumeTrend = trendBuckets.map((b, i) => ({ label: b.label, value: volumeSums[i] }));
  const settlementTrend = trendBuckets.map((b, i) => ({ label: b.label, value: settlementSums[i] }));
  const depositTrend = trendBuckets.map((b, i) => ({ label: b.label, value: depositSums[i] }));

  const attentionItems = buildAttentionItems(attentionCounts);
  const authMeter = describeAuthRate(authorizations.succeededCount, authorizations.totalCount);

  const todayLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: CENTRAL_TIME_ZONE,
  });
  const lastUpdated = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CENTRAL_TIME_ZONE });
  const periodLabel = rangeLabel(rangeParam, fromParam, toParam);
  const granularity = trend === "daily" ? "Daily" : trend === "monthly" ? "Monthly" : "Weekly";

  const insightsParams = new URLSearchParams({ tab: "payments" });
  if (rangeParam) insightsParams.set("range", rangeParam);
  if (fromParam) insightsParams.set("from", fromParam);
  if (toParam) insightsParams.set("to", toParam);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{todayLabel}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[30px]">
            {greetingFor(now)}, {church?.name || "welcome back"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Showing {periodLabel.toLowerCase()}. Updated at {lastUpdated}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomizeSummaryPanel />
          <DateRangePicker />
        </div>
      </header>

      <section aria-labelledby="summary-heading" className="space-y-4">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {selectedMetrics.map((key) => {
            const meta = METRIC_META[key];
            return (
              <KpiCard
                key={key}
                label={METRIC_LABELS[key]}
                value={metricValues[key]}
                icon={METRIC_ICONS[key]}
                delta={computeMetricDelta(
                  meta.kind,
                  meta.polarity,
                  metricNumbers[key],
                  previousNumbers ? previousNumbers[key] : null
                )}
                spark={sparkFor[key]}
                comparedTo="vs previous period"
              />
            );
          })}
        </div>
      </section>

      <AttentionStrip items={attentionItems} />

      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Donation volume</h2>
            <p className="mt-0.5 text-xs text-slate-500">{TREND_CAPTION[trend]}, successful payments</p>
          </div>
          <TrendToggle />
        </div>
        <VolumeAreaChart data={volumeTrend} title="Donation volume" />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Settlement volume</h2>
          <p className="mb-4 mt-0.5 text-xs text-slate-500">{granularity}</p>
          <MiniBarChart data={settlementTrend} title="Settlement volume" emptyText="No settlements in this period" />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Merchant deposits</h2>
          <p className="mb-4 mt-0.5 text-xs text-slate-500">{granularity}</p>
          <MiniBarChart data={depositTrend} title="Merchant deposits" emptyText="No deposits in this period" />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-5 text-sm font-semibold text-slate-900">Authorization rate</h2>
          <AuthRateMeter meter={authMeter} />
        </Card>
        <Suspense fallback={<CardSkeleton height={220} />}>
          <SourcesSection
            churchId={churchId}
            dateFilter={dateFilter}
            attributedUserId={scopedUserId}
            insightsHref={`/merchant/insights?${insightsParams.toString()}`}
          />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            <CardSkeleton height={260} />
            <CardSkeleton height={260} />
          </div>
        }
      >
        <DonorsSection churchId={churchId} dateFilter={dateFilter} attributedUserId={scopedUserId} buckets={trendBuckets} />
      </Suspense>

      <Suspense fallback={<CardSkeleton height={320} />}>
        <ActivitySection churchId={churchId} paymentScope={buildPaymentScope(auth, viewScope)} attributedUserId={scopedUserId} />
      </Suspense>

      <QuickActions
        finixMerchantId={church?.finixMerchantId || ""}
        churchName={church?.name || ""}
        pricing={{
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        }}
      />
    </div>
  );
}
