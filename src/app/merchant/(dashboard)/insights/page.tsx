import { getSession } from "@/lib/auth/session";
import InsightsTabs from "@/components/merchant/InsightsTabs";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import TrendFilter from "@/components/merchant/TrendFilter";
import StackedBarChart from "@/components/merchant/StackedBarChart";
import DimensionFilter from "@/components/merchant/DimensionFilter";
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
  PAYMENT_DIMENSIONS,
  type PaymentDimensionKey,
} from "@/lib/reports/insightsData";

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
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const {
    tab: tabParam,
    range: rangeParam,
    from: fromParam,
    to: toParam,
    trend: trendParam,
    dim: dimParam,
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
        <PaymentsTab churchId={churchId} dateFilter={dateFilter} trend={trend} dimension={dimension} />
      )}
      {tab === "authorizations" && (
        <AuthorizationsTab
          churchId={churchId}
          dateFilter={dateFilter}
          trend={trend}
          dimension={dimension}
        />
      )}
      {tab === "refunds" && (
        <RefundsTab churchId={churchId} dateFilter={dateFilter} trend={trend} dimension={dimension} />
      )}
      {tab === "disputes" && (
        <DisputesTab churchId={churchId} dateFilter={dateFilter} trend={trend} dimension={dimension} />
      )}
      {tab === "bank-returns" && (
        <BankReturnsTab churchId={churchId} dateFilter={dateFilter} trend={trend} />
      )}
      {tab === "deposits" && (
        <DepositsTab churchId={churchId} dateFilter={dateFilter} trend={trend} />
      )}
    </div>
  );
}

async function PaymentsTab({
  churchId,
  dateFilter,
  trend,
  dimension,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
}) {
  const { summary, byMethod, byMethodCount, byBrand, byBrandCount, byBrandTable, hasData } =
    await getPaymentsInsights(churchId, dateFilter, trend, dimension);
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
        <EmptyChart />
      </ChartCard>
    </>
  );
}

async function AuthorizationsTab({
  churchId,
  dateFilter,
  trend,
  dimension,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
}) {
  const { summary, byBrand, byBrandTable, hasData } = await getAuthorizationsInsights(
    churchId,
    dateFilter,
    trend,
    dimension
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
        <EmptyChart />
      </ChartCard>
    </>
  );
}

async function RefundsTab({
  churchId,
  dateFilter,
  trend,
  dimension,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
}) {
  const { summary, byStatus, byBrandTable, hasData } = await getRefundsInsights(
    churchId,
    dateFilter,
    trend,
    dimension
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
          <EmptyChart />
        </ChartCard>
        <ChartCard title="Refund Count Trend">
          <EmptyChart />
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
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
  dimension: PaymentDimensionKey;
}) {
  const { summary, byReason, byBrandTable, hasData } = await getDisputesInsights(
    churchId,
    dateFilter,
    trend,
    dimension
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
          <EmptyChart />
        </ChartCard>
      </div>

      <ChartCard title="Disputes per Merchant">
        <EmptyChart />
      </ChartCard>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Card Dispute Data</h3>
          <DimensionFilter />
        </div>
        <CardDisputeDataTable rows={byBrandTable} dimensionLabel={dimensionLabel} />
      </div>

      <ChartCard title="Dispute Reasons">
        <EmptyChart />
      </ChartCard>
    </>
  );
}

async function BankReturnsTab({
  churchId,
  dateFilter,
  trend,
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
}) {
  const { summary, trendData, byReasonTable, hasData } = await getBankReturnsInsights(
    churchId,
    dateFilter,
    trend
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
          <EmptyChart />
        </ChartCard>
      </div>

      <ChartCard title="ACH Returns per Merchant">
        <EmptyChart />
      </ChartCard>

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
}: {
  churchId: string;
  dateFilter: { gte: Date; lte?: Date } | undefined;
  trend: string;
}) {
  const { summary, trendData, hasData } = await getDepositsInsights(churchId, dateFilter, trend);

  return (
    <>
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
          <EmptyChart />
        </ChartCard>
      </div>
    </>
  );
}
