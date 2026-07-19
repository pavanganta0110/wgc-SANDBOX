import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadDonorInstrumentIds } from "@/lib/donors/donorTabs";
import { loadRecurringPaymentsForDonor, loadUnattributedRecurringCandidates } from "@/lib/subscriptions/recurringDonorPayments";
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
  // Team-access Checkpoint 4C: donor-qualification gate (a FUNDRAISER
  // cannot open a donor with zero attributed activity), and the payments
  // returned within a qualifying donor are now further filtered to this
  // user's own attributed recurring payments via loadRecurringPaymentsForDonor's
  // attributedUserId parameter.
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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  const { instrumentIds } = await loadDonorInstrumentIds(donorId, auth.churchId);
  const [payments, unattributedCandidates] = await Promise.all([
    loadRecurringPaymentsForDonor(instrumentIds, auth.churchId, page, pageSize, scopedUserId),
    // Unattributed reconciliation is an organization-level admin action —
    // never surfaced for a user-scoped view even if the permission were
    // somehow granted (it never is: canReconcileUnattributed is owner/admin only).
    permissions.canReconcileUnattributed && !scopedUserId
      ? loadUnattributedRecurringCandidates(instrumentIds, auth.churchId)
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ ...payments, page, pageSize, unattributedCandidates });
}
