import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function PATCH(req: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDisputePermissions(auth.rawRole);
  if (!permissions.canUpload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { disputeId } = await params;
  const dispute = await prisma.finixDispute.findFirst({ where: { finixDisputeId: disputeId, churchId: auth.churchId } });
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const { note } = await req.json();
  const trimmed = typeof note === "string" ? note.trim().slice(0, 2000) : "";

  await prisma.finixDispute.update({
    where: { id: dispute.id },
    data: { internalNote: trimmed || null },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "dispute.internal_note_updated",
    entityType: "dispute",
    entityId: dispute.finixDisputeId,
    req,
  });

  return NextResponse.json({ success: true });
}
