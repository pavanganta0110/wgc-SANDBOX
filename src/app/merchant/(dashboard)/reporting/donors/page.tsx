import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { RANGE_PRESETS } from "@/lib/dateRangePresets";
import { loadTopDonors } from "@/lib/donors/donorAnalytics";
import { parseLeaderboardRange } from "@/lib/donors/leaderboardRange";
import ReportExplorer from "@/components/merchant/reporting/ReportExplorer";
import DonorLeaderboardCard from "@/components/merchant/reporting/DonorLeaderboardCard";

export default async function DonorReportPage({
  searchParams,
}: {
  searchParams: Promise<{ leaderboardRange?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!hasPermission(auth, "canViewDonors")) redirect("/merchant/dashboard");

  const sp = await searchParams;
  const leaderboardRange = parseLeaderboardRange(sp.leaderboardRange);
  const preset = RANGE_PRESETS.find((p) => p.key === leaderboardRange);
  const { from: rangeFrom, to: rangeTo } = preset?.compute() ?? { from: new Date(), to: new Date() };
  const fromDate = rangeFrom ?? new Date();
  const toDate = rangeTo ?? new Date();

  // Same view-scope restriction the main Donors page's Top Donors card
  // respects (resolveScopedDonorIds) — a teammate viewing "as themselves"
  // sees a leaderboard of only their own attributed donors, not the whole
  // organization's.
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = (await resolveScopedDonorIds(auth, viewScope)) ?? undefined;

  const topDonors = await loadTopDonors(
    auth.churchId,
    { gte: fromDate, lte: toDate },
    "gross",
    10,
    scopedDonorIds,
  );

  return (
    <div className="space-y-4">
      <DonorLeaderboardCard rows={topDonors.rows} range={leaderboardRange} fromDate={fromDate} toDate={toDate} />

      <div>
        <h3 className="text-sm font-bold text-slate-900">Donor Report</h3>
        <p className="text-xs text-slate-500 mt-0.5">Filter, customize, and export donor giving data across every source.</p>
      </div>
      <ReportExplorer reportType="DONORS" canManageSavedReports={hasPermission(auth, "canManageSavedReports")} canExportReports={hasPermission(auth, "canExportReports")} />
    </div>
  );
}
