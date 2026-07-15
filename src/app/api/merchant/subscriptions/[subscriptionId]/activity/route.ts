import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionActivity } from "@/lib/subscriptions/subscriptionActivity";

export async function GET(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subscriptionId } = await params;
  const subscription = await prisma.finixSubscription.findFirst({ where: { id: subscriptionId, churchId: session.churchId } });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const events = await loadSubscriptionActivity(subscription, session.churchId);
  return NextResponse.json({ events });
}
