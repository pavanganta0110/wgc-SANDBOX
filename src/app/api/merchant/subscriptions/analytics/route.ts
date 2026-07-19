import { NextResponse } from "next/server";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionsAnalytics } from "@/lib/subscriptions/subscriptionsAnalytics";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rangeDays = parseInt(searchParams.get("rangeDays") || "30", 10) || 30;

  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;
  const analytics = await loadSubscriptionsAnalytics(auth.churchId, rangeDays, scopedUserId);
  return NextResponse.json(analytics);
}
