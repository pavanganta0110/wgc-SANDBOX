import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { cancelWgcSubscription, WgcSubscriptionCancellationError } from "@/lib/billing/wgcSubscriptionCancellation";

/** Only the organization owner or a user with canCancelSubscription may
 * cancel — enforced server-side via requirePermission, never only hidden
 * in the UI. Never accepts an organizationId or subscriptionId from the
 * request body; both are always derived from the authenticated session. */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canCancelSubscription");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const result = await cancelWgcSubscription({
      organizationId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
    });
    return NextResponse.json({ success: true, canceledAt: result.canceledAt });
  } catch (err) {
    if (err instanceof WgcSubscriptionCancellationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Subscription cancellation failed:", err);
    return NextResponse.json({ error: "Could not cancel the subscription. Please try again or contact support." }, { status: 500 });
  }
}
