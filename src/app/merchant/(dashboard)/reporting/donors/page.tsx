import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import ReportExplorer from "@/components/merchant/reporting/ReportExplorer";

export default async function DonorReportPage() {
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
        <h3 className="text-sm font-bold text-slate-900">Donor Report</h3>
        <p className="text-xs text-slate-500 mt-0.5">Filter, customize, and export donor giving data across every source.</p>
      </div>
      <ReportExplorer reportType="DONORS" canManageSavedReports={hasPermission(auth, "canManageSavedReports")} canExportReports={hasPermission(auth, "canExportReports")} />
    </div>
  );
}
