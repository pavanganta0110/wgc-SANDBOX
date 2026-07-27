import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

/** Lightweight donor typeahead — name/email/phone contains match, capped at
 * 10 results. Used by donor-picker UI (e.g. Record External Donation) where
 * a full donor-list page would be overkill. */
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
  if (!q || q.length < 2) return NextResponse.json({ donors: [] });

  const donors = await prisma.donor.findMany({
    where: {
      churchId: auth.churchId,
      archivedAt: null,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    select: { id: true, name: true, email: true, phone: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ donors });
}
