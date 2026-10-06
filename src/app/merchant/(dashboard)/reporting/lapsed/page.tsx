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
    <div className="min-w-0">
      <ReportExplorer
        reportType="LAPSED"
        fixedDateRange={{ key: "all" }}
        canManageSavedReports={hasPermission(auth, "canManageSavedReports")}
        canExportReports={hasPermission(auth, "canExportReports")}
        header={{
          current: "Lapsed Donors",
          title: "Lapsed Donors",
          subtitle:
            "Donors with real giving history who haven't given recently, ready for a personal follow-up. Nothing here contacts a donor automatically.",
        }}
      />
    </div>
  );
}
