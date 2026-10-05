import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

/** Donor typeahead AND browse-all. With a query, does a name/email/phone
 * contains-match capped at 50 (used by donor-picker UI e.g. Record External
 * Donation, and by the Giving Campaign composer's search-to-narrow). With no
 * query, returns the org's donors alphabetically, capped at 500 — this is
 * what powers the Giving Campaign composer's default browsable list ("Select
 * All" needs a bounded, predictable set to select from, not an unbounded
 * one). Callers that only ever want typeahead-on-keystroke (DonorPicker.tsx)
 * simply never call this with an empty/short query, so this doesn't change
 * their behavior. */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewDonors");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const hasQuery = Boolean(q && q.length > 0);

  const BROWSE_LIMIT = 500;
  const SEARCH_LIMIT = 50;

  const donors = await prisma.donor.findMany({
    where: {
      churchId: auth.churchId,
      archivedAt: null,
      ...(hasQuery
        ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] }
        : {}),
    },
    select: { id: true, name: true, email: true, phone: true },
    take: hasQuery ? SEARCH_LIMIT : BROWSE_LIMIT,
    orderBy: hasQuery ? { createdAt: "desc" } : { name: "asc" },
  });

  return NextResponse.json({ donors, truncated: !hasQuery && donors.length === BROWSE_LIMIT });
}
