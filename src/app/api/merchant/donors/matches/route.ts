import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

/**
 * The possible-match review queue: every PENDING PossibleDonorMatch for
 * this church (or ?status= a specific status), newest first. Scoped by
 * churchId only — there is no per-user sub-scoping here beyond the
 * existing owner/admin-only canReviewMatches gate, matching how donor
 * merge itself is already org-wide-only, never fundraiser-scoped.
 */
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "PENDING";

  const matches = await prisma.possibleDonorMatch.findMany({
    where: { churchId: auth.churchId, status },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const donorIds = [...new Set(matches.flatMap((m) => [m.existingDonorId, m.candidateDonorId]))];
  const donors = await prisma.donor.findMany({ where: { id: { in: donorIds }, churchId: auth.churchId } });
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  return NextResponse.json({
    matches: matches.map((m) => ({
      ...m,
      existingDonor: donorMap.get(m.existingDonorId) ?? null,
      candidateDonor: donorMap.get(m.candidateDonorId) ?? null,
    })),
  });
}
