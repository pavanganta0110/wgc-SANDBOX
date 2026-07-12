import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadRecurringDonorsAnalytics } from "@/lib/subscriptions/recurringDonorsAnalytics";

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rangeDays = parseInt(searchParams.get("rangeDays") || "30", 10) || 30;

  const analytics = await loadRecurringDonorsAnalytics(session.churchId, rangeDays);
  return NextResponse.json(analytics);
}
