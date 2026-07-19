import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";

const VALID_STATUSES = new Set(["UNRECONCILED", "PARTIALLY_RECONCILED", "RECONCILED", "MISMATCH", "NEEDS_REVIEW"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ settlementId: string }> }) {
  // Team-access Checkpoint 4C: intentionally NOT migrated to
  // requireMerchantSession() — canManageReconciliation is wgc_admin-only
  // (see settlementPermissions.ts: "no organization-side role gets these —
  // they're WGC-operational actions"), and requireMerchantSession() fails
  // closed for wgc_admin. This route only ever succeeds for WGC internal
  // support today, same exception class as bank-account/activate.
  const session = await getSession();
  const permissions = getSettlementPermissions(session?.role);
  // church_admin can view reconciliation status but never confirm or
  // override it — only wgc_admin can act on this route.
  if (!session || !session.churchId || !permissions.canManageReconciliation) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { settlementId } = await params;
  const settlement = await prisma.finixSettlement.findFirst({
    where: { finixSettlementId: settlementId, churchId: session.churchId },
  });
  if (!settlement) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  const body = await req.json();
  const status = typeof body.status === "string" ? body.status : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid reconciliation status" }, { status: 400 });
  }

  const previousStatus = settlement.reconciliationStatus;

  await prisma.finixSettlement.update({
    where: { id: settlement.id },
    data: {
      reconciliationStatus: status,
      reconciledAt: new Date(),
      reconciledByUserId: session.userId,
      reconciledByEmail: session.email,
      reconciliationNotes: notes || null,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: previousStatus === "UNRECONCILED" ? "settlement.reconciliation_confirmed" : "settlement.reconciliation_overridden",
    entityType: "settlement",
    entityId: settlement.finixSettlementId,
    metadata: { previousStatus, newStatus: status },
    req,
  });

  return NextResponse.json({ success: true });
}
