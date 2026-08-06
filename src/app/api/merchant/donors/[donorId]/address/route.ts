import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";

/** Returns just a donor's mailing address (never other financial fields) —
 * used to prefill address on flows like Record External Donation when an
 * existing donor is selected. Deliberately separate from the general donor
 * search endpoint so address data is only ever returned to a caller that
 * specifically holds canViewDonorAddress, not just canViewDonors. */
export async function GET(_req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewDonorAddress");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({
    where: { id: donorId, churchId: auth.churchId },
    select: {
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      addressSource: true,
      addressVerified: true,
      lastAddressConfirmedAt: true,
    },
  });
  if (!donor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ address: donor });
}
