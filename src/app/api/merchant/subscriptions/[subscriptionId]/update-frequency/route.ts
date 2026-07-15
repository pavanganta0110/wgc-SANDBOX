import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { SUPPORTED_SUBSCRIPTION_FREQUENCIES, resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { recreateSubscriptionWithChange } from "@/lib/subscriptions/subscriptionRecreate";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Same cancel+recreate mechanism as update-amount — Finix has no in-place update endpoint for billing_interval either. */
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUpdateFrequency) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;
  const { subscriptionId } = await params;

  const body = await req.json();
  const { newBillingInterval, idempotencyKey, consentConfirmed } = body;

  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });
  }
  if (!SUPPORTED_SUBSCRIPTION_FREQUENCIES.includes(newBillingInterval)) {
    return NextResponse.json({ error: "Unsupported frequency" }, { status: 400 });
  }
  if (consentConfirmed !== true) {
    return NextResponse.json({ error: "Donor consent confirmation is required for the new frequency" }, { status: 400 });
  }

  const existingAction = await prisma.subscriptionAction.findUnique({ where: { idempotencyKey } });
  if (existingAction) {
    if (existingAction.state === "COMPLETED") return NextResponse.json({ subscription: existingAction.newValue, idempotent: true });
    if (existingAction.state === "PENDING") return NextResponse.json({ error: "This request is already being processed" }, { status: 409 });
  }

  const subscription = await prisma.finixSubscription.findFirst({ where: { id: subscriptionId, churchId } });
  if (!subscription) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  const displayStatus = resolveSubscriptionDisplayStatus({ rawState: subscription.state, canceledAt: subscription.canceledAt, completedAt: subscription.completedAt });
  if (displayStatus !== "ACTIVE") {
    return NextResponse.json({ error: "Only an active subscription's frequency can be updated" }, { status: 400 });
  }
  if (newBillingInterval === subscription.billingInterval) {
    return NextResponse.json({ error: "The new frequency matches the current frequency" }, { status: 400 });
  }

  await prisma.subscriptionAction.create({
    data: {
      churchId,
      finixSubscriptionId: subscription.finixSubscriptionId,
      actionType: "UPDATE_FREQUENCY",
      idempotencyKey,
      requestedByUserId: session.userId,
      oldValue: { billingInterval: subscription.billingInterval },
      newValue: { billingInterval: newBillingInterval },
      state: "PENDING",
    },
  });

  try {
    const { newSubscription } = await recreateSubscriptionWithChange({
      churchId,
      actorUserId: session.userId!,
      oldSubscription: subscription,
      newBillingInterval,
    });

    const resultPayload = { id: newSubscription.id, finixSubscriptionId: newSubscription.finixSubscriptionId, billingInterval: newSubscription.billingInterval };

    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "COMPLETED", newValue: resultPayload, completedAt: new Date() },
    });

    await logDashboardAction({
      churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "subscription.frequency_updated",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { oldBillingInterval: subscription.billingInterval, newBillingInterval, newSubscriptionId: newSubscription.id },
      req,
    });

    return NextResponse.json({ subscription: resultPayload });
  } catch (err: any) {
    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "FAILED", failureReason: err.message || "Failed to update frequency" },
    });
    return NextResponse.json({ error: "The frequency could not be updated. The original subscription is unchanged." }, { status: 502 });
  }
}
