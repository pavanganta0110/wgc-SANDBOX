import { NextResponse } from "next/server";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { mergeDonors } from "@/lib/donors/donorMerge";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

// The `donorId` route param is the PRIMARY (surviving) donor; the body
// names the duplicate being merged away.
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
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
  const body = await req.json();
  const duplicateDonorId = typeof body.duplicateDonorId === "string" ? body.duplicateDonorId : "";
  if (!duplicateDonorId) {
    return NextResponse.json({ error: "duplicateDonorId is required" }, { status: 400 });
  }

  try {
    const result = await mergeDonors(donorId, duplicateDonorId, auth.churchId, auth.userId, auth.email);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "donor.merged",
      entityType: "donor",
      entityId: donorId,
      metadata: { archivedDonorId: duplicateDonorId, reassigned: result.reassigned },
      req,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to merge donors" }, { status: 400 });
  }
}
