import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";

// A submission attempt older than this is assumed dead (crashed request,
// timed-out connection, etc.) and can be reclaimed rather than blocking
// retries forever.
const STALE_LOCK_MS = 30_000;

export async function POST(req: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const session = await getSession();
  const permissions = getDisputePermissions(session?.role);
  if (!session || !session.churchId || !permissions.canSubmit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { disputeId } = await params;
  const dispute = await prisma.finixDispute.findFirst({
    where: { finixDisputeId: disputeId, churchId: session.churchId },
    include: { evidence: { where: { deletedAt: null } } },
  });
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }
  if (dispute.respondedAt) {
    // Already submitted — return the existing successful state instead of
    // erroring, so a double-click or a retried request is a no-op, not a
    // duplicate submission attempt.
    return NextResponse.json({ success: true, alreadySubmitted: true, respondedAt: dispute.respondedAt });
  }
  if (dispute.evidence.length === 0) {
    return NextResponse.json({ error: "Upload at least one piece of evidence before submitting." }, { status: 400 });
  }

  // Atomic claim: only one request can ever win this — a concurrent
  // second admin, a double-click, or a network retry all lose the race
  // and get told to wait rather than firing a second submission to the
  // processor. Reclaims the lock if a previous attempt went stale.
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const claim = await prisma.finixDispute.updateMany({
    where: {
      id: dispute.id,
      respondedAt: null,
      OR: [{ submissionAttemptedAt: null }, { submissionAttemptedAt: { lt: staleBefore } }],
    },
    data: { submissionAttemptedAt: new Date() },
  });

  if (claim.count === 0) {
    const current = await prisma.finixDispute.findUnique({ where: { id: dispute.id } });
    if (current?.respondedAt) {
      return NextResponse.json({ success: true, alreadySubmitted: true, respondedAt: current.respondedAt });
    }
    return NextResponse.json(
      { error: "A submission for this dispute is already in progress. Please wait a moment and try again." },
      { status: 409 }
    );
  }

  try {
    await finixClient.submitDisputeResponse(dispute.finixDisputeId);
  } catch (err: any) {
    const failureReason = err.message || "Failed to submit dispute response";
    // Release the lock immediately on failure (rather than waiting out
    // STALE_LOCK_MS) so the admin can retry right away without
    // re-uploading anything — the evidence already on file is untouched.
    await prisma.finixDispute.update({
      where: { id: dispute.id },
      data: {
        submissionAttemptedAt: null,
        submissionError: failureReason,
        submissionRetryCount: { increment: 1 },
      },
    });

    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "dispute.submission_failed",
      entityType: "dispute",
      entityId: dispute.finixDisputeId,
      metadata: { reason: failureReason, retryCount: dispute.submissionRetryCount + 1 },
      req,
    });

    return NextResponse.json({ error: failureReason }, { status: 502 });
  }

  const respondedAt = new Date();
  await prisma.$transaction([
    prisma.finixDispute.update({
      where: { id: dispute.id },
      data: { respondedAt, submissionError: null },
    }),
    prisma.disputeEvidence.updateMany({
      where: { disputeId: dispute.id, submittedAt: null, deletedAt: null },
      data: { submittedAt: respondedAt },
    }),
  ]);

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "dispute.response_submitted",
    entityType: "dispute",
    entityId: dispute.finixDisputeId,
    metadata: { evidenceCount: dispute.evidence.length },
    req,
  });

  return NextResponse.json({ success: true, respondedAt });
}
