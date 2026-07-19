import { NextResponse } from "next/server";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { csvResponse } from "@/lib/csvExport";
import { formatCents } from "@/lib/format";
import { loadDonorSummary } from "@/lib/donors/donorSummary";
import { loadDonationTrend } from "@/lib/donors/donorAnalytics";
import { loadDonorAnalyticsExtended, loadDonorGrowth } from "@/lib/donors/donorAnalyticsExtended";
import { logDashboardAction } from "@/lib/dashboardAudit";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  let previousPeriodFilter: { gte: Date; lte?: Date } | undefined;
  if (dateFilter?.lte) {
    const spanMs = dateFilter.lte.getTime() - dateFilter.gte.getTime();
    previousPeriodFilter = { gte: new Date(dateFilter.gte.getTime() - spanMs), lte: new Date(dateFilter.gte.getTime() - 1) };
  }

  const churchId = auth.churchId;

  const summary = await loadDonorSummary(churchId, dateFilter);
  const trend = await loadDonationTrend(churchId, dateFilter, "weekly");
  const extended = await loadDonorAnalyticsExtended(churchId, dateFilter, previousPeriodFilter);
  const growth = await loadDonorGrowth(churchId, dateFilter, "weekly");

  const lines: string[] = [];
  lines.push("Section,Metric,Value");
  lines.push(`Summary,Total Donors,${summary.totalDonors}`);
  lines.push(`Summary,Active Donors,${summary.activeDonors}`);
  lines.push(`Summary,New Donors,${summary.newDonors}`);
  lines.push(`Summary,Recurring Donors,${summary.recurringDonors}`);
  lines.push(`Summary,Total Donated,${csvEscape(formatCents(summary.totalDonatedCents))}`);
  lines.push(`Summary,Average Donation,${csvEscape(formatCents(summary.averageDonationCents))}`);
  lines.push(`Summary,Donors With Failed Payments,${summary.donorsWithFailedPayments}`);
  lines.push(`Summary,Donors Requiring Attention,${summary.donorsRequiringAttention}`);
  lines.push(`New vs Returning,New Donors,${extended.newVsReturning.newCount}`);
  lines.push(`New vs Returning,Returning Donors,${extended.newVsReturning.returningCount}`);
  lines.push(`One-Time vs Recurring,One-Time Donations,${extended.oneTimeVsRecurring.oneTimeCount}`);
  lines.push(`One-Time vs Recurring,Recurring Donations,${extended.oneTimeVsRecurring.recurringCount}`);
  lines.push(`Retention,Returning Donor Rate,${extended.retention.returningDonorRate ?? "N/A"}`);
  lines.push(`Retention,Retained Donors,${extended.retention.retainedDonors}`);
  lines.push(`Concentration,Top 10% Donor Share,${extended.concentration.top10SharePct}%`);

  lines.push("");
  lines.push("Donation Trend (Weekly)");
  lines.push("Period,Gross Donated,Net Donated,Donation Count,Unique Donors");
  for (const t of trend) {
    lines.push(
      [t.period, formatCents(t.grossDonatedCents), formatCents(t.netDonatedCents), t.donationCount, t.uniqueDonorCount]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }

  lines.push("");
  lines.push("Donor Growth (Weekly)");
  lines.push("Period,New Donors,Returning Donors,Total Active Donors");
  for (const g of growth) {
    lines.push([g.period, g.newDonors, g.returningDonors, g.totalActiveDonors].map((v) => csvEscape(String(v))).join(","));
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor_analytics.exported",
    entityType: "donor",
    metadata: { range: range || null },
    req,
  });

  return csvResponse(lines.join("\n"), "donor-analytics.csv");
}
