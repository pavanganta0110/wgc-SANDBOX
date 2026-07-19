import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";
import { loadDonorInstrumentIds, loadDonorDisputesTab } from "@/lib/donors/donorTabs";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Team-access Checkpoint 4A: disputes have no row-level attribution wired
  // yet — FUNDRAISER/VIEWER denied entirely per the approved fallback policy.
  if (!getDisputePermissions(auth.rawRole).canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);
  if (scopedDonorIds !== null && !scopedDonorIds.includes(donorId)) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const { instrumentIds } = await loadDonorInstrumentIds(donorId, auth.churchId);
  const disputes = await loadDonorDisputesTab(instrumentIds, auth.churchId);
  return NextResponse.json({ disputes });
}
