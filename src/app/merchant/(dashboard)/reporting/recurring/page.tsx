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
    <div className="min-w-0">
      <ReportExplorer
        reportType="RECURRING"
        canManageSavedReports={hasPermission(auth, "canManageSavedReports")}
        canExportReports={hasPermission(auth, "canExportReports")}
        header={{
          current: "Recurring Giving",
          title: "Recurring Giving",
          subtitle:
            "Every active, paused and canceled recurring donor, built on the same subscription data as the Recurring Donors page.",
        }}
      />
    </div>
  );
}
