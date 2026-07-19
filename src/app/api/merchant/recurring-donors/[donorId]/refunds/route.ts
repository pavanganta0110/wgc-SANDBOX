import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadDonorInstrumentIds, loadDonorRefundsTab } from "@/lib/donors/donorTabs";
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
  // Team-access Checkpoint 4B: same donor-qualification + per-tab
  // attribution scoping as the main donor detail page.
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

  const { instrumentIds } = await loadDonorInstrumentIds(donorId, auth.churchId);
  const refunds = await loadDonorRefundsTab(instrumentIds, auth.churchId, scopedUserId);
  return NextResponse.json({ refunds });
}
