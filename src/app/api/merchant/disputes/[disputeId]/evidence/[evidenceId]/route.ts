import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";

/**
 * Removes an evidence file before final submission. This is WGC-side only —
 * soft-deletes the metadata row (hides it everywhere, excludes it from
 * counts/allowance, preserves it for audit history) and drops it from what
 * gets marked submittedAt when the dispute is later submitted. There is no
 * confirmed processor endpoint for deleting an already-uploaded evidence
 * file, so this does not attempt to remove the file from the processor's
 * side — only files still present when /submit is called end up part of
 * the dispute response either way.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ disputeId: string; evidenceId: string }> }
) {
  const session = await getSession();
  const permissions = getDisputePermissions(session?.role);
  if (!session || !session.churchId || !permissions.canDelete) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { disputeId, evidenceId } = await params;
  const dispute = await prisma.finixDispute.findFirst({
    where: { finixDisputeId: disputeId, churchId: session.churchId },
  });
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }
  if (dispute.respondedAt) {
    return NextResponse.json({ error: "Evidence is locked after the response has been submitted." }, { status: 409 });
  }

  const evidence = await prisma.disputeEvidence.findFirst({
    where: { id: evidenceId, disputeId: dispute.id, deletedAt: null },
  });
  if (!evidence) {
    return NextResponse.json({ error: "Evidence file not found" }, { status: 404 });
  }

  await prisma.disputeEvidence.update({
    where: { id: evidence.id },
    data: { deletedAt: new Date(), deletedByEmail: session.email },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "dispute.evidence_deleted",
    entityType: "dispute",
    entityId: dispute.finixDisputeId,
    metadata: { evidenceId: evidence.id, fileName: evidence.fileName, finixFileId: evidence.finixFileId },
    req,
  });

  return NextResponse.json({ success: true });
}
