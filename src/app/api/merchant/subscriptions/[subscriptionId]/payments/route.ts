import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadPaymentsForSubscription } from "@/lib/subscriptions/subscriptionPayments";

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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  const result = await loadPaymentsForSubscription(subscription.finixSubscriptionId, session.churchId, page, pageSize);
  return NextResponse.json({ ...result, page, pageSize });
}
