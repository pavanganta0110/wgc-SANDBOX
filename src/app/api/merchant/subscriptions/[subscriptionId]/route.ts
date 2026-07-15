import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";

export async function GET(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subscriptionId } = await params;
  const [subscription] = await loadSubscriptionCandidates(session.churchId, { id: subscriptionId });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json({ subscription });
}
