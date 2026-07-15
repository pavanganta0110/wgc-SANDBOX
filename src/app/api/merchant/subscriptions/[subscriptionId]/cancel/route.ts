import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Cancel is the one Finix subscriptions API mutation genuinely supported (DELETE). Only ACTIVE/PAST_DUE/UNKNOWN schedules can be canceled — already-canceled or completed ones are rejected rather than silently re-processed. */
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canCancel) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;
  const { subscriptionId } = await params;

  const body = await req.json().catch(() => ({}));
  const { reason, idempotencyKey } = body;
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });
  }

  const existingAction = await prisma.subscriptionAction.findUnique({ where: { idempotencyKey } });
  if (existingAction) {
    if (existingAction.state === "COMPLETED") return NextResponse.json({ subscription: existingAction.newValue, idempotent: true });
    if (existingAction.state === "PENDING") return NextResponse.json({ error: "This request is already being processed" }, { status: 409 });
  }

  const subscription = await prisma.finixSubscription.findFirst({ where: { id: subscriptionId, churchId } });
  if (!subscription) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  const displayStatus = resolveSubscriptionDisplayStatus({ rawState: subscription.state, canceledAt: subscription.canceledAt, completedAt: subscription.completedAt });
  if (displayStatus === "CANCELED") return NextResponse.json({ error: "This subscription is already canceled" }, { status: 400 });
  if (displayStatus === "COMPLETED") return NextResponse.json({ error: "This subscription has already completed and cannot be canceled" }, { status: 400 });

  await prisma.subscriptionAction.create({
    data: {
      churchId,
      finixSubscriptionId: subscription.finixSubscriptionId,
      actionType: "CANCEL",
      idempotencyKey,
      requestedByUserId: session.userId,
      oldValue: { state: subscription.state },
      state: "PENDING",
    },
  });

  try {
    await finixClient.cancelSubscription(subscription.finixSubscriptionId);

    const updated = await prisma.finixSubscription.update({
      where: { id: subscription.id },
      data: { canceledAt: new Date(), cancelReason: reason || null, canceledByUserId: session.userId, state: "CANCELED", lastSyncedAt: new Date() },
    });

    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "COMPLETED", newValue: { canceledAt: updated.canceledAt }, completedAt: new Date() },
    });

    await logDashboardAction({
      churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "subscription.canceled",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { reason: reason || null },
      req,
    });

    return NextResponse.json({ subscription: { id: updated.id, canceledAt: updated.canceledAt } });
  } catch (err: any) {
    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "FAILED", failureReason: err.message || "Failed to cancel subscription" },
    });
    return NextResponse.json({ error: "Subscription was not canceled. Please try again." }, { status: 502 });
  }
}
