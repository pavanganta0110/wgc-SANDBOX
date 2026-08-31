import { redirect } from "next/navigation";
import InsightsTabs from "@/components/merchant/InsightsTabs";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import TrendFilter from "@/components/merchant/TrendFilter";
import StackedBarChart from "@/components/merchant/StackedBarChart";
import BarChart from "@/components/merchant/BarChart";
import DimensionFilter from "@/components/merchant/DimensionFilter";
import ExternalDonationsInsightsFilterBar from "@/components/merchant/ExternalDonationsInsightsFilterBar";
import CardPaymentDataTable from "@/components/merchant/CardPaymentDataTable";
import CardAuthorizationDataTable from "@/components/merchant/CardAuthorizationDataTable";
import CardDisputeDataTable from "@/components/merchant/CardDisputeDataTable";
import AchReturnsTable from "@/components/merchant/AchReturnsTable";
import { resolveDateRange } from "@/lib/dateRangePresets";
import {
  getPaymentsInsights,
  getAuthorizationsInsights,
  getRefundsInsights,
  getDisputesInsights,
  getBankReturnsInsights,
  getDepositsInsights,
  getExternalDonationsInsights,
  PAYMENT_DIMENSIONS,
  type PaymentDimensionKey,
} from "@/lib/reports/insightsData";
import { SOURCE_LABELS } from "@/lib/donations/externalDonationTypes";
import { formatCents } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

function SummaryCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-slate-500 mb-1 underline decoration-dotted underline-offset-2">
              {item.label}
            </p>
            <p className="text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-56 text-sm text-slate-400 bg-slate-50 rounded-xl">
      No results returned
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
    trend?: string;
    dim?: string;
    extMethod?: string;
    extReceiptStatus?: string;
    extFund?: string;
    extSource?: string;
  }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;
  const {
    tab: tabParam,
    range: rangeParam,
    from: fromParam,
    to: toParam,
    trend: trendParam,
    dim: dimParam,
    extMethod,
    extReceiptStatus,
    extFund,
    extSource,
  } = await searchParams;
  const tab = tabParam || "payments";
  const trend = trendParam && ["daily", "weekly", "monthly"].includes(trendParam) ? trendParam : "weekly";
  const dimension: PaymentDimensionKey = PAYMENT_DIMENSIONS.some((d) => d.key === dimParam)
    ? (dimParam as PaymentDimensionKey)
    : "cardBrand";
  const { from: startDate, to: endDate } = resolveDateRange(rangeParam, fromParam, toParam);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Transaction Insights</h1>
      </div>

      <InsightsTabs />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">
          Summary <span className="font-normal text-slate-400">compared to previous period</span>
        </p>
        <DateRangePicker />
      </div>

      {tab === "payments" && (
        <PaymentsTab churchId={churchId} dateFilter={dateFilter} trend={trend} dimension={dimension} scopedUserId={scopedUserId} />
      )}
      {tab === "authorizations" && (
        <AuthorizationsTab
          churchId={churchId}
          dateFilter={dateFilter}
          trend={trend}
          dimension={dimension}
          scopedUserId={scopedUserId}
        />
      )}
      {tab === "refunds" && (
        <RefundsTab churchId={churchId} dateFilter={dateFilter} trend={trend} dimension={dimension} scopedUserId={scopedUserId} />
      )}
      {tab === "disputes" && (
        <DisputesTab churchId={churchId} dateFilter={dateFilter} trend={trend} dimension={dimension} scopedUserId={scopedUserId} />
      )}
      {tab === "bank-returns" && (
        <BankReturnsTab churchId={churchId} dateFilter={dateFilter} trend={trend} scopedUserId={scopedUserId} />
      )}
      {tab === "deposits" && (
        <DepositsTab churchId={churchId} dateFilter={dateFilter} trend={trend} scopedUserId={scopedUserId} />
      )}
      {tab === "external" && (
        <ExternalDonationsTab
          churchId={churchId}
          dateFilter={dateFilter}
          scopedUserId={scopedUserId}
          filters={{ paymentMethod: extMethod, receiptStatus: extReceiptStatus, fundId: extFund, source: extSource }}
        />
      )}
    </div>
  );
}

async function ExternalDonationsTab({
  churchId,
  dateFilter,
  scopedUserId,
  filters,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  scopedUserId?: string;
  filters: { paymentMethod?: string; receiptStatus?: string; fundId?: string; source?: string };
}) {
  const [{ summary, bySourceTable, byFundTable, hasData }, funds] = await Promise.all([
    getExternalDonationsInsights(churchId, dateFilter, scopedUserId, filters),
    prisma.fund.findMany({ where: { churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <ExternalDonationsInsightsFilterBar funds={funds} />
      <SummaryCards items={summary} />
      <p className="text-xs text-slate-400 -mt-2">
        External donations are never sent to WGC&apos;s payment processor — they never count toward WGC-processed volume, settlement totals, or processing fees.
        The WGC-Processed total above reflects the date range only and is not affected by the filters below.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="External Donations by Source">
          {hasData ? (
            <div className="divide-y divide-slate-100">
              {bySourceTable.map((row) => (
                <div key={row.source} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{SOURCE_LABELS[row.source as keyof typeof SOURCE_LABELS] ?? row.source}</span>
                  <span className="text-slate-500">{row.count} donation{row.count === 1 ? "" : "s"}</span>
                  <span className="font-semibold text-slate-900">{formatCents(row.totalCents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="External Donations by Fund">
          {hasData ? (
            <div className="divide-y divide-slate-100">
              {byFundTable.map((row) => (
                <div key={row.fund} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{row.fund}</span>
                  <span className="text-slate-500">{row.count} donation{row.count === 1 ? "" : "s"}</span>
                  <span className="font-semibold text-slate-900">{formatCents(row.totalCents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>
    </>
  );
}

async function PaymentsTab({
  churchId,
  dateFilter,
  trend,
  dimension,
  scopedUserId,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
  scopedUserId?: string;
}) {
  const { summary, byMethod, byMethodCount, byBrand, byBrandCount, byBrandTable, byFailureCode, hasData } =
    await getPaymentsInsights(churchId, dateFilter, trend, dimension, scopedUserId);
  const dimensionLabel = PAYMENT_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Card Brand";

  return (
    <>
      <SummaryCards items={summary} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Payment Trends</p>
        <TrendFilter />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Payment Volume by Payment Method">
          {hasData ? (
            <StackedBarChart
              data={byMethod}
              seriesKeys={Object.keys(byMethod[0]?.values ?? {})}
              formatValue={(n) => `$${n.toFixed(0)}`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Payment Count by Payment Method">
          {hasData ? (
            <StackedBarChart
              data={byMethodCount}
              seriesKeys={Object.keys(byMethodCount[0]?.values ?? {})}
              formatValue={(n) => n.toFixed(0)}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Payment Volume by Card Brand">
          {hasData ? (
            <StackedBarChart
              data={byBrand}
              seriesKeys={Object.keys(byBrand[0]?.values ?? {})}
              formatValue={(n) => `$${n.toFixed(0)}`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Payment Count by Card Brand">
          {hasData ? (
            <StackedBarChart
              data={byBrandCount}
              seriesKeys={Object.keys(byBrandCount[0]?.values ?? {})}
              formatValue={(n) => n.toFixed(0)}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Card Payment Data</h3>
          <DimensionFilter />
        </div>
        <CardPaymentDataTable rows={byBrandTable} dimensionLabel={dimensionLabel} />
      </div>

      <ChartCard title="Failed Transactions by Failure Code">
        {byFailureCode.length > 0 ? (
          <BarChart
            data={byFailureCode.map((f) => ({ label: f.code, value: f.volumeCents / 100 }))}
            formatValue={(n) => `$${n.toFixed(0)}`}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartCard>
    </>
  );
}

async function AuthorizationsTab({
  churchId,
  dateFilter,
  trend,
  dimension,
  scopedUserId,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
  scopedUserId?: string;
}) {
  const { summary, byBrand, byBrandTable, byFailureCode, hasData } = await getAuthorizationsInsights(
    churchId,
    dateFilter,
    trend,
    dimension,
    scopedUserId
  );
  const dimensionLabel = PAYMENT_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Card Brand";

  return (
    <>
      <SummaryCards items={summary} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Authorization Trends</p>
        <TrendFilter />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Authorization Rate by Card Brand">
          {hasData ? (
            <StackedBarChart
              data={byBrand}
              seriesKeys={Object.keys(byBrand[0]?.values ?? {})}
              formatValue={(n) => `${n.toFixed(0)}%`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Authorization Count by Card Brand">
          {hasData ? (
            <StackedBarChart
              data={byBrand}
              seriesKeys={Object.keys(byBrand[0]?.values ?? {})}
              formatValue={(n) => n.toFixed(0)}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Card Authorization Data</h3>
          <DimensionFilter />
        </div>
        <CardAuthorizationDataTable rows={byBrandTable} dimensionLabel={dimensionLabel} />
      </div>

      <ChartCard title="Failed Authorizations by Failure Code">
        {byFailureCode.length > 0 ? (
          <BarChart
            data={byFailureCode.map((f) => ({ label: f.code, value: f.volumeCents / 100 }))}
            formatValue={(n) => `$${n.toFixed(0)}`}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartCard>
    </>
  );
}

async function RefundsTab({
  churchId,
  dateFilter,
  trend,
  dimension,
  scopedUserId,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
  scopedUserId?: string;
}) {
  const { summary, byStatus, byBrandTable, volumeTrend, countTrend, hasData } = await getRefundsInsights(
    churchId,
    dateFilter,
    trend,
    dimension,
    scopedUserId
  );
  const dimensionLabel = PAYMENT_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Card Brand";

  return (
    <>
      <SummaryCards items={summary} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Refund Trends</p>
        <TrendFilter />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Refund Volume by Status">
          {hasData ? (
            <StackedBarChart
              data={byStatus}
              seriesKeys={Object.keys(byStatus[0]?.values ?? {})}
              formatValue={(n) => `$${n.toFixed(0)}`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Refund Count by Status">
          {hasData ? (
            <StackedBarChart
              data={byStatus}
              seriesKeys={Object.keys(byStatus[0]?.values ?? {})}
              formatValue={(n) => n.toFixed(0)}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Refund Volume Trend">
          {hasData ? (
            <StackedBarChart data={volumeTrend} seriesKeys={["Refund Volume"]} formatValue={(n) => `$${n.toFixed(0)}`} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Refund Count Trend">
          {hasData ? (
            <StackedBarChart data={countTrend} seriesKeys={["Refund Count"]} formatValue={(n) => n.toFixed(0)} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Card Refund Data</h3>
          <DimensionFilter />
        </div>
        <CardPaymentDataTable rows={byBrandTable} dimensionLabel={dimensionLabel} />
      </div>
    </>
  );
}

async function DisputesTab({
  churchId,
  dateFilter,
  trend,
  dimension,
  scopedUserId,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
  scopedUserId?: string;
}) {
  const { summary, byReason, byBrandTable, disputeRateByBrand, disputeReasonTotals, hasData } = await getDisputesInsights(
    churchId,
    dateFilter,
    trend,
    dimension,
    scopedUserId
  );
  const dimensionLabel = PAYMENT_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Card Brand";

  return (
    <>
      <SummaryCards items={summary} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Dispute Trends</p>
        <TrendFilter />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Disputes Over Time">
          {hasData ? (
            <StackedBarChart
              data={byReason}
              seriesKeys={Object.keys(byReason[0]?.values ?? {})}
              formatValue={(n) => `$${n.toFixed(0)}`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Dispute Rate by Card Brand">
          {disputeRateByBrand.length > 0 ? (
            <BarChart
              data={disputeRateByBrand.map((b) => ({ label: b.brand, value: b.ratePercent }))}
              formatValue={(n) => `${n.toFixed(2)}%`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Card Dispute Data</h3>
          <DimensionFilter />
        </div>
        <CardDisputeDataTable rows={byBrandTable} dimensionLabel={dimensionLabel} />
      </div>

      <ChartCard title="Dispute Reasons">
        {disputeReasonTotals.length > 0 ? (
          <BarChart
            data={disputeReasonTotals.map((r) => ({ label: r.reason, value: r.count }))}
            formatValue={(n) => n.toFixed(0)}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartCard>
    </>
  );
}

async function BankReturnsTab({
  churchId,
  dateFilter,
  trend,
  scopedUserId,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  scopedUserId?: string;
}) {
  const { summary, trendData, byReasonTable, returnRateTrend, hasData } = await getBankReturnsInsights(
    churchId,
    dateFilter,
    trend,
    scopedUserId
  );

  return (
    <>
      <SummaryCards items={summary} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">ACH Returns Trends</p>
        <TrendFilter />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="ACH Return Volume and Count">
          {hasData ? (
            <StackedBarChart
              data={trendData}
              seriesKeys={["Total Volume"]}
              formatValue={(n) => `$${n.toFixed(0)}`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="ACH Return Rate">
          {hasData ? (
            <StackedBarChart data={returnRateTrend} seriesKeys={["Return Rate"]} formatValue={(n) => `${n.toFixed(2)}%`} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">ACH Returns by Reason Code</h3>
        </div>
        <AchReturnsTable rows={byReasonTable} />
      </div>
    </>
  );
}

async function DepositsTab({
  churchId,
  dateFilter,
  trend,
  scopedUserId,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  scopedUserId?: string;
}) {
  const { summary, trendData, countTrendData, hasData } = await getDepositsInsights(churchId, dateFilter, trend);

  return (
    <>
      {scopedUserId && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          Deposits bundle transactions from the entire organization and can&apos;t be broken down by team member — showing organization-wide totals.
        </div>
      )}
      <SummaryCards items={summary} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Deposit Trends</p>
        <TrendFilter />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Deposit Volume">
          {hasData ? (
            <StackedBarChart
              data={trendData}
              seriesKeys={["Deposit Volume"]}
              formatValue={(n) => `$${n.toFixed(0)}`}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Deposit Count Trend">
          {hasData ? (
            <StackedBarChart
              data={countTrendData}
              seriesKeys={["Deposit Count"]}
              formatValue={(n) => n.toFixed(0)}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>
    </>
  );
}
