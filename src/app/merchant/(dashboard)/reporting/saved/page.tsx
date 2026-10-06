import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { summarizeSavedReportConfig } from "@/lib/reporting/savedReportSummary";
import SavedReportsList from "@/components/merchant/reporting/SavedReportsList";

export default async function SavedReportsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!hasPermission(auth, "canViewDonors")) redirect("/merchant/dashboard");

  const reports = await prisma.savedReport.findMany({
    where: {
      churchId: auth.churchId,
      OR: [{ createdByUserId: auth.userId }, { visibility: "ORGANIZATION" }],
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-w-0">
      <SavedReportsList
        reports={reports.map((r) => ({
          id: r.id,
          name: r.name,
          reportType: r.reportType,
          visibility: r.visibility,
          isOwner: r.createdByUserId === auth.userId,
          updatedAt: r.updatedAt.toISOString(),
          summary: summarizeSavedReportConfig(r.configuration),
        }))}
        canManage={hasPermission(auth, "canManageSavedReports")}
      />
    </div>
  );
}
