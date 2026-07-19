import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionCandidates, groupSubscriptionsByDonor } from "@/lib/subscriptions/subscriptionAggregates";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds, resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
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

  const { donorId } = await params;
  // Team-access Checkpoint 4D: donor-qualification from attributed
  // Payment/FinixSubscription records — matches the pattern already used by
  // the recurring-donor payments/giving-links/activity routes.
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);
  if (scopedDonorIds !== null && !scopedDonorIds.includes(donorId)) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;

  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const subscriptions = await loadSubscriptionCandidates(auth.churchId, { donorId, attributedUserId: scopedUserId });
  const [recurringDonor] = groupSubscriptionsByDonor(subscriptions);

  if (!recurringDonor) {
    return NextResponse.json({ error: "This donor has no recurring donation history" }, { status: 404 });
  }

  return NextResponse.json({
    donor: {
      id: donor.id,
      name: donor.anonymousPreference ? "Anonymous Donor" : donor.name,
      email: donor.email,
      phone: donor.phone,
      addressLine1: donor.addressLine1,
      addressLine2: donor.addressLine2,
      city: donor.city,
      state: donor.state,
      postalCode: donor.postalCode,
      country: donor.country,
      companyName: donor.companyName,
      createdAt: donor.createdAt,
    },
    recurringDonor,
  });
}
