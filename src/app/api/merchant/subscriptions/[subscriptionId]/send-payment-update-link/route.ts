import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { sendSubscriptionPaymentUpdateLink } from "@/lib/subscriptions/paymentUpdateLink";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/** Sends a secure, expiring, single-use link the donor uses to provide a new payment method for this exact subscription — never exposes donor/org/subscription IDs in the URL, and completion (see /api/setup/[token]/complete) cancels this subscription and creates a replacement rather than mutating the existing Finix subscription in place. */
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canSendPaymentUpdateLink) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = auth.churchId;
  const { subscriptionId } = await params;

  const subscription = await prisma.finixSubscription.findFirst({ where: { id: subscriptionId, churchId } });
  if (!subscription) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  if (!subscription.donorId) return NextResponse.json({ error: "This subscription has no linked donor" }, { status: 400 });

  const displayStatus = resolveSubscriptionDisplayStatus({ rawState: subscription.state, canceledAt: subscription.canceledAt, completedAt: subscription.completedAt });
  if (displayStatus !== "ACTIVE" && displayStatus !== "PAST_DUE") {
    return NextResponse.json({ error: "A payment update link can only be sent for an active or past-due subscription" }, { status: 400 });
  }

  const donor = await prisma.donor.findFirst({ where: { id: subscription.donorId, churchId } });
  if (!donor?.email) return NextResponse.json({ error: "This donor has no email on file" }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const result = await sendSubscriptionPaymentUpdateLink({
    churchId,
    churchName: church.name,
    subscription,
    donor: { id: donor.id, email: donor.email },
    createdByUserId: auth.userId,
  });

  await logDashboardAction({
    churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "subscription.payment_update_link_sent",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: { donorEmail: donor.email },
    req,
  });

  if (!result.success) {
    return NextResponse.json({ error: "Failed to send the payment update link email." }, { status: 502 });
  }

  return NextResponse.json({ link: { id: result.linkId, status: "SENT", expiresAt: result.expiresAt } });
}
