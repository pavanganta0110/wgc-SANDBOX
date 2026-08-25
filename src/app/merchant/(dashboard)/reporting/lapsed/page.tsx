import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import ReportExplorer from "@/components/merchant/reporting/ReportExplorer";

export default async function LapsedDonorReportPage() {
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
        <h3 className="text-sm font-bold text-slate-900">Lapsed Donors</h3>
        <p className="text-xs text-slate-500 mt-0.5">Donors with real giving history who haven't given recently — useful for follow-up. Nothing here contacts a donor automatically.</p>
      </div>
      <ReportExplorer reportType="LAPSED" fixedDateRange={{ key: "all" }} canManageSavedReports={hasPermission(auth, "canManageSavedReports")} canExportReports={hasPermission(auth, "canExportReports")} />
    </div>
  );
}
