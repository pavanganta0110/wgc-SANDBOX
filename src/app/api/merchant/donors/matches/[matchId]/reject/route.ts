import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Rejecting a possible match means "these are two different people" — the
 * candidate donor row (already created, already holding its donation)
 * simply stays a separate, standalone donor. Nothing is reassigned or
 * deleted; this only closes out the review item.
 */
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canReviewMatches) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const body = await req.json().catch(() => ({}));
  const resolutionNote = typeof body?.note === "string" ? body.note : null;

  const match = await prisma.possibleDonorMatch.findFirst({ where: { id: matchId, churchId: auth.churchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "PENDING") {
    return NextResponse.json({ error: `This match was already resolved (${match.status})` }, { status: 400 });
  }

  await prisma.possibleDonorMatch.update({
    where: { id: match.id },
    data: { status: "REJECTED", reviewedByUserId: auth.userId, reviewedByEmail: auth.email, reviewedAt: new Date(), resolutionNote },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.match_manually_rejected",
    entityType: "donor",
    entityId: match.candidateDonorId,
    metadata: { possibleMatchId: match.id, existingDonorId: match.existingDonorId, resolutionNote },
    req,
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.new_donor_after_review",
    entityType: "donor",
    entityId: match.candidateDonorId,
    metadata: { possibleMatchId: match.id, rejectedMatchWith: match.existingDonorId },
    req,
  });

  return NextResponse.json({ status: "REJECTED" });
}
