import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadPaymentsForSubscription } from "@/lib/subscriptions/subscriptionPayments";
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

  // Team-access Checkpoint 4D: direct subscriptionId must not bypass
  // attribution scoping — same pattern as the activity route.
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;
  const { subscriptionId } = await params;
  const subscription = await prisma.finixSubscription.findFirst({
    where: { id: subscriptionId, churchId: auth.churchId, ...(scopedUserId ? { attributedUserId: scopedUserId } : {}) },
  });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  const result = await loadPaymentsForSubscription(subscription.finixSubscriptionId, auth.churchId, page, pageSize);
  return NextResponse.json({ ...result, page, pageSize });
}
