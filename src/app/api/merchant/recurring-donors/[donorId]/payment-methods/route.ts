import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadDonorInstrumentIds } from "@/lib/donors/donorTabs";
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

  const { instruments: allInstruments } = await loadDonorInstrumentIds(donorId, auth.churchId);

  // Team-access Checkpoint 4D: no raw card/bank numbers or tokens are ever
  // stored on FinixPaymentInstrumentSnapshot (masked metadata only —
  // brand/last4/expiration/holder name/state), but a FUNDRAISER must still
  // only see payment methods tied to a subscription attributed to them —
  // restrict to instruments backing an attributed subscription for this donor.
  let instruments = allInstruments;
  if (scopedUserId) {
    const attributedInstrumentIds = new Set(
      (
        await prisma.finixSubscription.findMany({
          where: { churchId: auth.churchId, donorId, attributedUserId: scopedUserId, finixPaymentInstrumentId: { not: null } },
          select: { finixPaymentInstrumentId: true },
        })
      ).map((s) => s.finixPaymentInstrumentId!),
    );
    instruments = allInstruments.filter((i) => attributedInstrumentIds.has(i.finixPaymentInstrumentId));
  }

  const subscriptions = await prisma.finixSubscription.findMany({
    where: { churchId: auth.churchId, donorId, finixPaymentInstrumentId: { not: null }, ...(scopedUserId ? { attributedUserId: scopedUserId } : {}) },
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
