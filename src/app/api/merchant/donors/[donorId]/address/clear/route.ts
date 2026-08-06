import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { clearDonorAddress } from "@/lib/donors/donorAddress";

/** Clears an incorrect address off a donor — the prior value is preserved in the audit log (donor.address_cleared), never deleted from history. */
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditDonorAddress");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { donorId } = await params;
  try {
    const donor = await clearDonorAddress({
      donorId,
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      req,
    });
    return NextResponse.json({ donor });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not clear address" }, { status: 400 });
  }
}
