import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionCandidates, groupSubscriptionsByDonor, type RecurringDonorRow } from "@/lib/subscriptions/subscriptionAggregates";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { formatCents } from "@/lib/format";
import { logDashboardAction } from "@/lib/dashboardAudit";

const COLUMNS: CsvColumn<RecurringDonorRow>[] = [
  { header: "Donor ID", value: (r) => r.donorId },
  { header: "Donor Name", value: (r) => r.donorName },
  { header: "Email", value: (r) => r.donorEmail || "" },
  { header: "Overall Recurring Status", value: (r) => r.overallStatus },
  { header: "Monthly Recurring Value", value: (r) => formatCents(r.monthlyValueCents) },
  { header: "Annualized Value", value: (r) => formatCents(r.annualizedValueCents) },
  { header: "Active Subscriptions", value: (r) => String(r.activeSubscriptionCount) },
  { header: "Total Subscriptions", value: (r) => String(r.totalSubscriptionCount) },
  { header: "Next Billing Date", value: (r) => (r.nextBillingDate ? r.nextBillingDate.toISOString() : "") },
  { header: "Last Successful Payment", value: (r) => (r.lastSuccessfulPayment ? `${formatCents(r.lastSuccessfulPayment.amountCents)} on ${r.lastSuccessfulPayment.date.toISOString()}` : "") },
  { header: "Failed Payment Count", value: (r) => String(r.failedPaymentCount) },
  { header: "Past-Due Subscription Count", value: (r) => String(r.pastDueSubscriptionCount) },
  { header: "Lifetime Recurring Donated", value: (r) => formatCents(r.lifetimeRecurringDonatedCents) },
  { header: "Requires Attention", value: (r) => (r.requiresAttention ? "Yes" : "No") },
];

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptions = await loadSubscriptionCandidates(session.churchId);
  const donors = groupSubscriptionsByDonor(subscriptions);

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "recurring_donors.exported",
    entityType: "recurring_donor",
    metadata: { rowCount: donors.length },
    req,
  });

  const csv = buildCsvExport(donors, COLUMNS);
  return csvResponse(csv, "recurring-donors.csv");
}
