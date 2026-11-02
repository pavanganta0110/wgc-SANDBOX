import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import ReportExplorer from "@/components/merchant/reporting/ReportExplorer";
import { getPaymentWording } from "@/lib/settings/paymentWording";

export default async function AnnualGivingReportPage() {
  const { pw } = await getPaymentWording();
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
        reportType="ANNUAL"
        fixedDateRange={{ key: "year", year: new Date().getFullYear() }}
        canManageSavedReports={hasPermission(auth, "canManageSavedReports")}
        canExportReports={hasPermission(auth, "canExportReports")}
        header={{
          current: "Annual Giving",
          title: pw("Annual Giving Report"),
          subtitle:
            pw("Every donor's total giving for a calendar year. Uses the same rules as Annual Statements, so totals never conflict."),
        }}
      />
    </div>
  );
}
