import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadDonorInstrumentIds } from "@/lib/donors/donorTabs";
import { loadRecurringPaymentsForDonor, loadUnattributedRecurringCandidates } from "@/lib/subscriptions/recurringDonorPayments";

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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  const { instrumentIds } = await loadDonorInstrumentIds(donorId, session.churchId);
  const [payments, unattributedCandidates] = await Promise.all([
    loadRecurringPaymentsForDonor(instrumentIds, session.churchId, page, pageSize),
    permissions.canReconcileUnattributed ? loadUnattributedRecurringCandidates(instrumentIds, session.churchId) : Promise.resolve([]),
  ]);

  return NextResponse.json({ ...payments, page, pageSize, unattributedCandidates });
}
