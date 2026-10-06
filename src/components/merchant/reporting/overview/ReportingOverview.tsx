import Link from "next/link";
import {
  Clock,
  DollarSign,
  Plus,
  Receipt,
  Repeat,
  Sparkles,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { ReportingOverviewModel } from "./types";
import PageHeader from "../ui/PageHeader";
import KpiTile from "./KpiTile";
import DeltaPill from "./DeltaPill";
import Sparkline from "./Sparkline";
import RetentionMeter from "./RetentionMeter";
import GivingTrend from "./GivingTrend";
import DonorMixDonut from "./DonorMixDonut";
import MethodMix from "./MethodMix";
import DonorBands from "./DonorBands";
import FundRanking from "./FundRanking";
import ReportCards from "./ReportCards";
import YearSelect from "./YearSelect";
import ExportButton from "./ExportButton";
import { SERIES } from "./tokens";
import { formatCents } from "./format";

function GroupLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {children}
      </h4>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

export default function ReportingOverview({
  model,
  currentYear,
  canCreateReports,
}: {
  model: ReportingOverviewModel;
  currentYear: number;
  canCreateReports: boolean;
}) {
  const { kpis: k, year } = model;
  const icon = "h-4 w-4";
  const monthlyNet = model.trend.map((t) => t.netDonatedCents);
  const monthlyAvg = model.trend.map((t) =>
    t.donationCount > 0 ? Math.round(t.netDonatedCents / t.donationCount) : 0,
  );
  const retained = k.priorYearDonors - k.lapsedDonors;
  const givingLabel = model.isCurrentYear ? "YTD giving" : `${year} giving`;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <PageHeader
        current="Overview"
        title="Reporting"
        subtitle="Donor analytics, giving reports, and exports."
        actions={
          <>
            <YearSelect
              year={year}
              options={model.yearOptions}
              currentYear={currentYear}
            />
            {model.canExport && <ExportButton model={model} />}
            {canCreateReports && (
              <Link
                href="/merchant/reporting/donors"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Create report
              </Link>
            )}
          </>
        }
      >
        <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl bg-indigo-50/70 px-3.5 py-2.5 text-sm font-medium text-indigo-950">
          <Sparkles
            className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
            aria-hidden
          />
          <span>{model.headline}</span>
        </p>
      </PageHeader>

      {/* Giving */}
      <section aria-label="Giving">
        <GroupLabel
          hint={
            model.isCurrentYear ? "Net of refunds" : `${year}, net of refunds`
          }
        >
          Giving
        </GroupLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-12">
          <KpiTile
            size="lg"
            className="col-span-2 sm:col-span-3 lg:col-span-6"
            label={givingLabel}
            href="/merchant/reporting/annual"
            value={formatCents(k.ytdGivingCents)}
            icon={<DollarSign className="h-5 w-5" />}
            tip={`Money given ${model.isCurrentYear ? "so far this year" : `in ${year}`}, after refunds and returned payments.`}
            delta={
              <DeltaPill delta={model.givingDelta} vs={model.comparisonLabel} />
            }
            hint={
              model.givingDelta.percent === null &&
              model.givingDelta.direction === "flat"
                ? "Nothing yet this period"
                : `vs ${model.comparisonLabel}`
            }
            spark={
              <Sparkline
                values={monthlyNet}
                color={SERIES.indigo}
                height={44}
              />
            }
          />
          <KpiTile
            className="lg:col-span-2 sm:col-span-1"
            label="Last year"
            href="/merchant/reporting/annual"
            value={formatCents(k.previousYearGivingCents)}
            icon={<Clock className={icon} />}
            tip={`Net giving for all of ${year - 1}.`}
            hint={String(year - 1)}
          />
          <KpiTile
            className="lg:col-span-2 sm:col-span-1"
            label="Lifetime"
            href="/merchant/reporting/donors"
            value={formatCents(k.lifetimeGivingCents)}
            icon={<Wallet className={icon} />}
            tip="Everything your donors have given since you started, after refunds."
            hint="All time"
          />
          <KpiTile
            className="col-span-2 sm:col-span-1 lg:col-span-2"
            label="Average gift"
            href="/merchant/reporting/donors"
            value={formatCents(k.averageGiftCents)}
            icon={<Receipt className={icon} />}
            tip="Net giving divided by the number of gifts in this period."
            delta={
              <DeltaPill
                delta={model.averageGiftDelta}
                vs={model.comparisonLabel}
              />
            }
            hint={
              k.giftCount > 0
                ? `${k.giftCount.toLocaleString("en-US")} gifts`
                : "No gifts yet"
            }
            spark={<Sparkline values={monthlyAvg} color={SERIES.indigo} />}
          />
        </div>
      </section>

      {/* Donors */}
      <section aria-label="Donors">
        <GroupLabel
          hint={model.isCurrentYear ? `${year} so far` : String(year)}
        >
          Donors
        </GroupLabel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <KpiTile
            label="Total donors"
            href="/merchant/donors"
            value={k.totalDonors.toLocaleString("en-US")}
            icon={<Users className={icon} />}
            tip="Everyone on your donor list."
            hint="On your donor list"
          />
          <KpiTile
            label="New"
            href="/merchant/reporting/donors"
            value={k.newDonors.toLocaleString("en-US")}
            icon={<UserPlus className={icon} />}
            tip={`Donors whose very first gift was in ${year}.`}
            hint={`First gift in ${year}`}
          />
          <KpiTile
            label="Returning"
            href="/merchant/reporting/donors"
            value={k.returningDonors.toLocaleString("en-US")}
            icon={<UserCheck className={icon} />}
            tip={`Donors who gave in ${year} and had already given before ${year}.`}
            hint={`Gave before ${year}`}
          />
          <KpiTile
            label="Recurring"
            href="/merchant/reporting/recurring"
            value={k.recurringDonors.toLocaleString("en-US")}
            icon={<Repeat className={icon} />}
            tip={`Donors who gave through a recurring plan in ${year}.`}
            hint="On a schedule"
          />
          <KpiTile
            label="Lapsed"
            href="/merchant/reporting/lapsed"
            value={k.lapsedDonors.toLocaleString("en-US")}
            icon={<UserMinus className={icon} />}
            tip={`Gave in ${year - 1} but haven't given yet in ${year}.`}
            hint={
              k.lapsedDonors === 0
                ? k.priorYearDonors === 0
                  ? `No giving in ${year - 1}`
                  : "None. Nice!"
                : `Gave in ${year - 1}, not yet ${year}`
            }
            className="col-span-2 md:col-span-1"
          />
        </div>
      </section>

      {/* Health */}
      <section aria-label="Health">
        <GroupLabel>Health</GroupLabel>
        <RetentionMeter
          ratePercent={k.donorRetentionRatePercent}
          priorYearDonors={k.priorYearDonors}
          retained={retained}
          lapsed={k.lapsedDonors}
          year={year}
        />
      </section>

      {/* Trend */}
      <section aria-label="Trends" className="space-y-3">
        <GroupLabel>Trends</GroupLabel>
        <GivingTrend data={model.trend} periodLabel={model.periodLabel} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DonorMixDonut
            newCount={k.newDonors}
            returningCount={k.returningDonors}
            recurring={k.recurringDonors}
            lapsed={k.lapsedDonors}
            year={year}
          />
          <MethodMix rows={model.methodMix} />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DonorBands rows={model.distribution} />
          <FundRanking rows={model.funds} />
        </div>
      </section>

      {/* Reports library */}
      <section aria-label="Reports">
        <GroupLabel>Reports</GroupLabel>
        <ReportCards savedCount={model.savedReportsCount} />
      </section>
    </div>
  );
}
