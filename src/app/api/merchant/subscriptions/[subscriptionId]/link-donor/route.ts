import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/** Lightweight donor search used only to populate the manual donor-matching picker — never used to auto-assign, only to let an admin pick. */
export async function GET(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canUpdateAmount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await params;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ donors: [] });

  const donors = await prisma.donor.findMany({
    where: {
      churchId: auth.churchId,
      archivedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true },
    take: 10,
  });

  return NextResponse.json({ donors });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canUpdateAmount) {
    // Reuses the existing "can manage subscription details" permission tier
    // rather than inventing a new one for this narrow admin-only action.
    return NextResponse.json({ error: "Not authorized to match donors" }, { status: 403 });
  }

  const { subscriptionId } = await params;
  const body = await req.json();
  const donorId = typeof body.donorId === "string" ? body.donorId.trim() : "";
  if (!donorId) {
    return NextResponse.json({ error: "donorId is required" }, { status: 400 });
  }

  const subscription = await prisma.finixSubscription.findFirst({
    where: { id: subscriptionId, churchId: auth.churchId },
  });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Never trust a donorId from the client without confirming it belongs to
  // this same church — tenant isolation, not just an existence check.
  const donor = await prisma.donor.findFirst({
    where: { id: donorId, churchId: auth.churchId },
  });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found in this organization" }, { status: 400 });
  }

  await prisma.finixSubscription.update({
    where: { id: subscriptionId },
    data: { donorId, needsDonorMatching: false, lastReconciledAt: new Date() },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "subscription.donor_manually_matched",
    entityType: "finix_subscription",
    entityId: subscriptionId,
    metadata: { donorId, donorName: donor.name },
  });

  return NextResponse.json({ success: true, donor: { id: donor.id, name: donor.name } });
}
