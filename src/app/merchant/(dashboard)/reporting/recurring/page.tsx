import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import ReportExplorer from "@/components/merchant/reporting/ReportExplorer";

export default async function RecurringGivingReportPage() {
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
        <h3 className="text-sm font-bold text-slate-900">Recurring Giving Report</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Every active/paused/canceled recurring donor, built on the same subscription data as the Recurring Donors page — nothing here is a second copy of that data.
        </p>
      </div>
      <ReportExplorer reportType="RECURRING" canManageSavedReports={hasPermission(auth, "canManageSavedReports")} canExportReports={hasPermission(auth, "canExportReports")} />
    </div>
  );
}
