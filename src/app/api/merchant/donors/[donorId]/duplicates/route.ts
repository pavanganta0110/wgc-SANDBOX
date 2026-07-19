import { NextResponse } from "next/server";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { findPossibleDuplicates } from "@/lib/donors/donorMerge";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canMerge) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const candidates = await findPossibleDuplicates(donorId, auth.churchId);
  return NextResponse.json({ candidates });
}
