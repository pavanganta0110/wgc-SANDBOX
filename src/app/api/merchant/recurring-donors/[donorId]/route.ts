import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionCandidates, groupSubscriptionsByDonor } from "@/lib/subscriptions/subscriptionAggregates";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: session.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const subscriptions = await loadSubscriptionCandidates(session.churchId, { donorId });
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
