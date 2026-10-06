import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import {
  loadFirstGiftYear,
  loadReportingKpis,
} from "@/lib/reporting/dashboard";
import {
  loadGivingByFund,
  loadOrgPaymentMethodMix,
  bucketDonorsByLifetimeGiving,
} from "@/lib/reporting/orgCharts";
import {
  buildHeadline,
  computeDelta,
  groupLongTail,
  parseReportingYear,
  reportingYearOptions,
  resolveReportingPeriod,
  withShares,
} from "@/lib/reporting/reportingPeriod";
import { loadDonorAggregatesBatch } from "@/lib/donors/donorAggregates";
import { loadDonationTrend } from "@/lib/donors/donorAnalytics";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import ReportingOverview from "@/components/merchant/reporting/overview/ReportingOverview";
import { METHOD_LABEL } from "@/components/merchant/reporting/overview/tokens";
import type { ReportingOverviewModel } from "@/components/merchant/reporting/overview/types";

const MAX_FUND_ROWS = 8;
const HEADLINE_METHOD = {
  CARD: "card",
  ACH: "bank transfer",
  EXTERNAL: "external gifts",
} as const;

export default async function ReportingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!hasPermission(auth, "canViewDonors")) redirect("/merchant/dashboard");

  // Tenant scope always comes from the session, never from the request.
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);

  const now = new Date();
  const currentYear = now.getFullYear();
  const { year: yearParam } = await searchParams;
  const firstGiftYear = await loadFirstGiftYear(churchId);
  const year = parseReportingYear(yearParam, currentYear, firstGiftYear);
  const period = resolveReportingPeriod(year, now);

  const donorWhere = {
    churchId,
    archivedAt: null,
    ...(scopedDonorIds ? { id: { in: scopedDonorIds } } : {}),
  };
  const [kpis, trend, funds, methods, savedCount, distributionDonors] =
    await Promise.all([
      loadReportingKpis(auth, period),
      loadDonationTrend(
        churchId,
        period.range,
        "monthly",
        scopedDonorIds ?? undefined,
        "all",
      ),
      loadGivingByFund(churchId, period.range, scopedDonorIds ?? undefined),
      loadOrgPaymentMethodMix(
        churchId,
        period.range,
        scopedDonorIds ?? undefined,
      ),
      prisma.savedReport.count({
        where: {
          churchId,
          OR: [
            { createdByUserId: auth.userId },
            { visibility: "ORGANIZATION" },
          ],
        },
      }),
      // Per-donor lifetime totals are bounded by the same cap the KPI loader uses, so this never becomes an unbounded scan.
      prisma.donor.findMany({
        where: donorWhere,
        select: { id: true },
        take: 5000,
      }),
    ]);

  const lifetime = await loadDonorAggregatesBatch(
    distributionDonors.map((d) => d.id),
    churchId,
  );
  const bands = bucketDonorsByLifetimeGiving(
    [...lifetime.values()].map((a) => a.netDonatedCents),
  );
  const bandTotal = bands.reduce((s, b) => s + b.donorCount, 0);

  const methodRows = withShares(
    methods.map((m) => ({
      key: m.method,
      label: METHOD_LABEL[m.method],
      valueCents: m.amountCents,
      count: m.count,
    })),
  );
  const topMethod = [...methodRows].sort(
    (a, b) => b.valueCents - a.valueCents,
  )[0];

  const fundGroups = groupLongTail(
    funds.map((f) => ({ label: f.fundName, valueCents: f.amountCents })),
    MAX_FUND_ROWS,
  );
  const fundRows = withShares(fundGroups).map((f) => ({
    label: f.label,
    valueCents: f.valueCents,
    sharePercent: f.sharePercent,
    isOther: f.isOther,
  }));

  const model: ReportingOverviewModel = {
    year,
    isCurrentYear: period.isCurrentYear,
    yearOptions: reportingYearOptions(firstGiftYear, currentYear),
    periodLabel: period.label,
    comparisonLabel: period.comparisonLabel,
    headline: buildHeadline({
      year,
      isCurrentYear: period.isCurrentYear,
      givingCents: kpis.ytdGivingCents,
      donorCount: kpis.givingDonors,
      topMethod:
        topMethod && topMethod.valueCents > 0
          ? {
              label: HEADLINE_METHOD[topMethod.key],
              sharePercent: topMethod.sharePercent,
            }
          : null,
      formatMoney: formatCents,
    }),
    kpis,
    givingDelta: computeDelta(kpis.ytdGivingCents, kpis.comparisonGivingCents),
    averageGiftDelta: computeDelta(
      kpis.averageGiftCents,
      kpis.comparisonAverageGiftCents,
    ),
    trend: trend.map((t) => ({
      period: t.period,
      grossDonatedCents: t.grossDonatedCents,
      netDonatedCents: t.netDonatedCents,
      donationCount: t.donationCount,
      uniqueDonorCount: t.uniqueDonorCount,
    })),
    methodMix: methodRows,
    distribution: bands.map((b) => ({
      label: b.label,
      donorCount: b.donorCount,
      sharePercent: bandTotal > 0 ? (b.donorCount / bandTotal) * 100 : 0,
    })),
    funds: fundRows,
    savedReportsCount: savedCount,
    canExport: hasPermission(auth, "canExportReports"),
  };

  return (
    <ReportingOverview
      model={model}
      currentYear={currentYear}
      canCreateReports={hasPermission(auth, "canManageSavedReports")}
    />
  );
}
