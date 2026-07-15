import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { loadDonorSummary } from "@/lib/donors/donorSummary";
import { loadDonationTrend, loadTopDonors, type TopDonorMetric } from "@/lib/donors/donorAnalytics";
import { loadDonorAnalyticsExtended, loadDonorGrowth } from "@/lib/donors/donorAnalyticsExtended";
import { loadDonorPaymentMethodMix } from "@/lib/donors/donorBreakdowns";
import { prisma } from "@/lib/prisma";

// Organization scope is always resolved from the authenticated session —
// never accepted from the browser, even though callers could try to pass
// their own churchId in the query string.
export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const topDonorMetric = (searchParams.get("topDonorMetric") as TopDonorMetric) || "net";

  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  let previousPeriodFilter: { gte: Date; lte?: Date } | undefined;
  if (dateFilter?.lte) {
    const spanMs = dateFilter.lte.getTime() - dateFilter.gte.getTime();
    previousPeriodFilter = { gte: new Date(dateFilter.gte.getTime() - spanMs), lte: new Date(dateFilter.gte.getTime() - 1) };
  }

  const churchId = session.churchId;

  const summary = await loadDonorSummary(churchId, dateFilter);
  const trend = await loadDonationTrend(churchId, dateFilter, "weekly");
  const topDonors = await loadTopDonors(churchId, dateFilter, topDonorMetric, 10);
  const extended = await loadDonorAnalyticsExtended(churchId, dateFilter, previousPeriodFilter);
  const growth = await loadDonorGrowth(churchId, dateFilter, "weekly");

  const allInstruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { not: null } },
    select: { finixPaymentInstrumentId: true },
  });
  const paymentMethodMix = await loadDonorPaymentMethodMix(
    allInstruments.map((i) => i.finixPaymentInstrumentId),
    churchId,
  );

  return NextResponse.json({
    summary,
    trend,
    topDonors: topDonors.rows,
    newVsReturning: extended.newVsReturning,
    oneTimeVsRecurring: extended.oneTimeVsRecurring,
    statusBreakdown: extended.statusBreakdown,
    retention: extended.retention,
    concentration: extended.concentration,
    attentionList: extended.attentionList,
    growth,
    paymentMethodMix,
    candidateCapReached: extended.candidateCapReached,
  });
}
