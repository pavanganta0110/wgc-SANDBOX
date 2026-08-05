import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Postpones a review decision — the match stays actionable later (unlike
 * reject, which is a final "these are different people" decision). */
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

  await prisma.possibleDonorMatch.update({
    where: { id: match.id },
    data: { status: "SKIPPED", reviewedByUserId: auth.userId, reviewedByEmail: auth.email, reviewedAt: new Date() },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.match_skipped",
    entityType: "donor",
    entityId: match.candidateDonorId,
    metadata: { possibleMatchId: match.id, existingDonorId: match.existingDonorId },
    req,
  });

  return NextResponse.json({ status: "SKIPPED" });
}
