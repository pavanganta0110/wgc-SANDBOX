import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { activateSmsAddonSubscription, SmsAddonSubscriptionError } from "@/lib/billing/smsAddonSubscriptionService";
import { getSmsAddonPlan } from "@/lib/billing/smsAddonPlans";

/**
 * Subscribes the org to the text-messaging add-on. Unlike
 * /api/billing/activate (the platform subscription), this collects no new
 * payment info — it reuses the org's existing WgcBillingAccount, so this
 * is a one-click "Subscribe" with no card form: submit, and the Finix
 * subscription is created and active in this same request (see
 * activateSmsAddonSubscription's doc comment).
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession(true); // allowlisted: billing management must remain reachable while restricted
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  if (!hasPermission(auth, "canManageSubscription")) {
    return NextResponse.json({ error: "Only the organization owner can manage add-on subscriptions." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const planCode = typeof body.planCode === "string" ? body.planCode : "";
  const plan = getSmsAddonPlan(planCode);
  if (!plan) {
    return NextResponse.json({ error: "Choose a valid text-messaging plan." }, { status: 400 });
  }

  try {
    const result = await activateSmsAddonSubscription({
      organizationId: auth.churchId,
      planCode: plan.code,
      actorUserId: auth.userId,
      actorEmail: auth.email,
    });
    return NextResponse.json({ success: true, subscription: result.subscription, alreadyExisted: result.alreadyExisted });
  } catch (err) {
    if (err instanceof SmsAddonSubscriptionError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("SMS add-on activation failed:", err);
    return NextResponse.json({ error: "Could not activate the text-messaging add-on. No charge was made. Please try again or contact support." }, { status: 500 });
  }
}
