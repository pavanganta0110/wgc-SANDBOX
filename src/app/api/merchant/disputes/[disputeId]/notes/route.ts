import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";

export async function PATCH(req: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const session = await getSession();
  const permissions = getDisputePermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUpload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { disputeId } = await params;
  const dispute = await prisma.finixDispute.findFirst({ where: { finixDisputeId: disputeId, churchId: session.churchId } });
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
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "dispute.internal_note_updated",
    entityType: "dispute",
    entityId: dispute.finixDisputeId,
    req,
  });

  return NextResponse.json({ success: true });
}
