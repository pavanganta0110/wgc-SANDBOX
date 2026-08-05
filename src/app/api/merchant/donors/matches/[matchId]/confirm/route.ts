import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { mergeDonors } from "@/lib/donors/donorMerge";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Confirming a possible match IS a merge — existingDonorId survives,
 * candidateDonorId (the newly-created donor the fuzzy scorer flagged) is
 * merged into it via the same mergeDonors() transaction the manual merge
 * UI uses, so every reassignment/preservation/rollback guarantee applies
 * identically here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canReviewMatches) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const match = await prisma.possibleDonorMatch.findFirst({ where: { id: matchId, churchId: auth.churchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "PENDING") {
    return NextResponse.json({ error: `This match was already resolved (${match.status})` }, { status: 400 });
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.merge_started",
    entityType: "donor",
    entityId: match.existingDonorId,
    metadata: { duplicateDonorId: match.candidateDonorId, method: "possible_match_review", possibleMatchId: match.id },
    req,
  });

  let result;
  try {
    result = await mergeDonors(match.existingDonorId, match.candidateDonorId, auth.churchId, auth.userId, auth.email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "donor.merge_failed",
      entityType: "donor",
      entityId: match.existingDonorId,
      metadata: { duplicateDonorId: match.candidateDonorId, possibleMatchId: match.id, error: message },
      req,
    });
    return NextResponse.json({ error: message || "Failed to merge donors" }, { status: 400 });
  }

  await prisma.possibleDonorMatch.update({
    where: { id: match.id },
    data: { status: "CONFIRMED", reviewedByUserId: auth.userId, reviewedByEmail: auth.email, reviewedAt: new Date() },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.match_manually_confirmed",
    entityType: "donor",
    entityId: match.existingDonorId,
    metadata: { possibleMatchId: match.id, duplicateDonorId: match.candidateDonorId, confidence: match.confidence, confidenceScore: match.confidenceScore },
    req,
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.merged",
    entityType: "donor",
    entityId: match.existingDonorId,
    metadata: { archivedDonorId: match.candidateDonorId, reassigned: result.reassigned, method: "possible_match_review" },
    req,
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.merge_completed",
    entityType: "donor",
    entityId: match.existingDonorId,
    metadata: { archivedDonorId: match.candidateDonorId, reassigned: result.reassigned },
    req,
  });

  return NextResponse.json({ status: "CONFIRMED", mergeResult: result });
}
