import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionCandidates, type SubscriptionRow } from "@/lib/subscriptions/subscriptionAggregates";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { formatCents } from "@/lib/format";
import { logDashboardAction } from "@/lib/dashboardAudit";

const COLUMNS: CsvColumn<SubscriptionRow>[] = [
  { header: "Subscription ID", value: (r) => r.finixSubscriptionId },
  { header: "Donor", value: (r) => r.donorName },
  { header: "Email", value: (r) => r.donorEmail || "" },
  { header: "Amount", value: (r) => formatCents(r.amountCents) },
  { header: "Frequency", value: (r) => frequencyLabel(r.billingInterval) },
  { header: "Monthly Value", value: (r) => formatCents(r.monthlyValueCents) },
  { header: "Status", value: (r) => r.displayStatus },
  { header: "Start Date", value: (r) => (r.startDate ? r.startDate.toISOString() : "") },
  { header: "Next Billing Date", value: (r) => (r.nextBillingDate ? r.nextBillingDate.toISOString() : "") },
  { header: "End Date", value: (r) => (r.endDate ? r.endDate.toISOString() : "") },
  { header: "Payment Method", value: (r) => (r.paymentMethod ? `${r.paymentMethod.brand || "Bank"} ****${r.paymentMethod.last4 || ""}` : "") },
  { header: "Last Four", value: (r) => r.paymentMethod?.last4 || "" },
  { header: "Giving Link", value: (r) => r.givingLinkName || "" },
  { header: "Fund/Campaign", value: (r) => r.fundName || "" },
  { header: "Failed Attempts", value: (r) => String(r.failedAttempts) },
  { header: "Lifetime Collected", value: (r) => formatCents(r.lifetimeCollectedCents) },
  { header: "Created", value: (r) => r.createdAt.toISOString() },
  { header: "Updated", value: (r) => r.updatedAt.toISOString() },
];

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await loadSubscriptionCandidates(session.churchId);

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "subscriptions.exported",
    entityType: "subscription",
    metadata: { rowCount: rows.length },
    req,
  });

  const csv = buildCsvExport(rows, COLUMNS);
  return csvResponse(csv, "subscriptions.csv");
}
