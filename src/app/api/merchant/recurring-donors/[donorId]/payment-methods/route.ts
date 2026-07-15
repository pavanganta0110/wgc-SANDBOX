import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadDonorInstrumentIds } from "@/lib/donors/donorTabs";

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

  const { instruments } = await loadDonorInstrumentIds(donorId, session.churchId);

  const subscriptions = await prisma.finixSubscription.findMany({
    where: { churchId: session.churchId, donorId, finixPaymentInstrumentId: { not: null } },
    select: { finixPaymentInstrumentId: true },
  });
  const subscriptionCountByInstrument = new Map<string, number>();
  for (const s of subscriptions) {
    if (!s.finixPaymentInstrumentId) continue;
    subscriptionCountByInstrument.set(s.finixPaymentInstrumentId, (subscriptionCountByInstrument.get(s.finixPaymentInstrumentId) || 0) + 1);
  }

  return NextResponse.json({
    paymentMethods: instruments.map((i) => ({
      ...i,
      subscriptionCount: subscriptionCountByInstrument.get(i.finixPaymentInstrumentId) || 0,
    })),
  });
}
