import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { confirmDonorAddress } from "@/lib/donors/donorAddress";

/** Merchant marks a donor's current address confirmed — by the donor or by the organization. Never automatic from format validation. */
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canConfirmDonorAddress");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { donorId } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const confirmedAs = body?.confirmedAs === "CONFIRMED_BY_DONOR" ? "CONFIRMED_BY_DONOR" : "CONFIRMED_BY_ORG";

  try {
    const donor = await confirmDonorAddress({
      donorId,
      churchId: auth.churchId,
      confirmedAs,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      req,
    });
    return NextResponse.json({ donor });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not confirm address" }, { status: 400 });
  }
}
