import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { loadDonorAggregates } from "@/lib/donors/donorAggregates";

/**
 * Full side-by-side comparison for one possible match: both donor
 * profiles, their lifetime aggregates, and the specific transactions that
 * would be reassigned if this match is confirmed — so a reviewer can see
 * exactly what merging (or not merging) affects before deciding.
 */
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
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
  const match = await prisma.possibleDonorMatch.findFirst({ where: { id: matchId, churchId: auth.churchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const [existingDonor, candidateDonor, existingAggregates, candidateAggregates, candidateExternalDonations, candidateNotes] = await Promise.all([
    prisma.donor.findFirst({ where: { id: match.existingDonorId, churchId: auth.churchId } }),
    prisma.donor.findFirst({ where: { id: match.candidateDonorId, churchId: auth.churchId } }),
    loadDonorAggregates(match.existingDonorId, auth.churchId),
    loadDonorAggregates(match.candidateDonorId, auth.churchId),
    prisma.externalDonation.findMany({
      where: { churchId: auth.churchId, donorId: match.candidateDonorId, status: { not: "VOIDED" } },
      orderBy: { donationDate: "desc" },
      take: 50,
    }),
    prisma.donorNote.count({ where: { donorId: match.candidateDonorId, churchId: auth.churchId } }),
  ]);

  if (!existingDonor || !candidateDonor) {
    return NextResponse.json({ error: "One of the donor records in this match no longer exists" }, { status: 404 });
  }

  return NextResponse.json({
    match,
    existingDonor,
    candidateDonor,
    existingAggregates,
    candidateAggregates,
    affectedTransactions: {
      externalDonations: candidateExternalDonations,
      noteCount: candidateNotes,
    },
  });
}
