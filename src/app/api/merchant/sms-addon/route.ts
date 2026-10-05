import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getSmsAddonSubscription } from "@/lib/billing/smsAddonSubscriptionService";
import { getSmsUsageForPeriod, resolveCurrentMonthRange } from "@/lib/giving/smsUsage";
import { SMS_ADDON_PLANS } from "@/lib/billing/smsAddonPlans";
import { hasPermission } from "@/lib/auth/permissions";
import { isSmsConfigured } from "@/lib/sms/sendText";

/** Status the composer's Text toggle and the Billing Plan page both read:
 * whether the org can send texts right now, and how much of this month's
 * allowance they've used. Read-only — anyone who can view the merchant
 * dashboard can check this; only canManageSubscription can subscribe (see
 * the sibling subscribe route). */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const subscription = await getSmsAddonSubscription(auth.churchId);
  const { start, end, billingPeriod } = resolveCurrentMonthRange();
  const textsSent = subscription?.status === "ACTIVE" ? await getSmsUsageForPeriod(auth.churchId, start, end) : 0;

  return NextResponse.json({
    active: subscription?.status === "ACTIVE",
    subscription: subscription
      ? {
          planCode: subscription.planCode,
          status: subscription.status,
          includedTexts: subscription.includedTexts,
          monthlyAmountCents: subscription.monthlyAmountCents,
          overageRateCents: subscription.overageRateCents,
        }
      : null,
    usage: { textsSent, billingPeriod },
    plans: Object.values(SMS_ADDON_PLANS),
    canManageSubscription: hasPermission(auth, "canManageSubscription"),
    // Donor/campaign SMS is hard-disabled until TWILIO_DONOR_FROM_NUMBER is
    // deliberately introduced alongside its own approved Twilio campaign —
    // see sendText.ts. The UI shows "Coming Soon" instead of a live
    // Subscribe button while this is false, and the subscribe route itself
    // refuses to activate (and start charging) a feature that can't
    // actually send anything yet.
    smsConfigured: isSmsConfigured(),
  });
}
