import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { recreateSubscriptionWithChange } from "@/lib/subscriptions/subscriptionRecreate";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** No in-place update endpoint exists on Finix's subscriptions API — this cancels the old schedule and creates a replacement with the new amount, chained via supersedes/supersededBy. Historical payments on the old subscription are never altered. */
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUpdateAmount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;
  const { subscriptionId } = await params;

  const body = await req.json();
  const { newAmountCents, idempotencyKey, consentConfirmed } = body;

  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });
  }
  if (!Number.isFinite(newAmountCents) || newAmountCents < 100) {
    return NextResponse.json({ error: "Please enter a valid amount of at least $1.00" }, { status: 400 });
  }
  if (consentConfirmed !== true) {
    return NextResponse.json({ error: "Donor consent confirmation is required for the new amount" }, { status: 400 });
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
    return NextResponse.json({ error: "Only an active subscription's amount can be updated" }, { status: 400 });
  }
  if (newAmountCents === subscription.amountCents) {
    return NextResponse.json({ error: "The new amount matches the current amount" }, { status: 400 });
  }

  await prisma.subscriptionAction.create({
    data: {
      churchId,
      finixSubscriptionId: subscription.finixSubscriptionId,
      actionType: "UPDATE_AMOUNT",
      idempotencyKey,
      requestedByUserId: session.userId,
      oldValue: { amountCents: subscription.amountCents },
      newValue: { amountCents: newAmountCents },
      state: "PENDING",
    },
  });

  try {
    const { newSubscription } = await recreateSubscriptionWithChange({
      churchId,
      actorUserId: session.userId!,
      oldSubscription: subscription,
      newAmountCents,
    });

    const resultPayload = { id: newSubscription.id, finixSubscriptionId: newSubscription.finixSubscriptionId, amountCents: newSubscription.amountCents };

    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "COMPLETED", newValue: resultPayload, completedAt: new Date() },
    });

    await logDashboardAction({
      churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "subscription.amount_updated",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { oldAmountCents: subscription.amountCents, newAmountCents, newSubscriptionId: newSubscription.id },
      req,
    });

    return NextResponse.json({ subscription: resultPayload });
  } catch (err: any) {
    await prisma.subscriptionAction.update({
      where: { idempotencyKey },
      data: { state: "FAILED", failureReason: err.message || "Failed to update amount" },
    });
    return NextResponse.json({ error: "The amount could not be updated. The original subscription is unchanged." }, { status: 502 });
  }
}
