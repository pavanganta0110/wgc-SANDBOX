import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import ReportExplorer from "@/components/merchant/reporting/ReportExplorer";

export default async function AnnualGivingReportPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!hasPermission(auth, "canViewDonors")) redirect("/merchant/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Annual Giving Report</h3>
        <p className="text-xs text-slate-500 mt-0.5">Select a year to see every donor's total giving for that calendar year. Uses the same eligibility rules as Annual Statements, so totals never conflict.</p>
      </div>
      <ReportExplorer reportType="ANNUAL" fixedDateRange={{ key: "year", year: new Date().getFullYear() }} canManageSavedReports={hasPermission(auth, "canManageSavedReports")} canExportReports={hasPermission(auth, "canExportReports")} />
    </div>
  );
}
