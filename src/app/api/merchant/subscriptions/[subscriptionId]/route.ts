import { NextResponse } from "next/server";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
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

  const { subscriptionId } = await params;
  // Team-access Checkpoint 4A: id + scope combined in one query.
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;
  const [subscription] = await loadSubscriptionCandidates(auth.churchId, { id: subscriptionId, attributedUserId: scopedUserId });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json({ subscription });
}
