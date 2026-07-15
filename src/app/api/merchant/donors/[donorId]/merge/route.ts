import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { mergeDonors } from "@/lib/donors/donorMerge";

// The `donorId` route param is the PRIMARY (surviving) donor; the body
// names the duplicate being merged away.
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canMerge) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const body = await req.json();
  const duplicateDonorId = typeof body.duplicateDonorId === "string" ? body.duplicateDonorId : "";
  if (!duplicateDonorId) {
    return NextResponse.json({ error: "duplicateDonorId is required" }, { status: 400 });
  }

  try {
    const result = await mergeDonors(donorId, duplicateDonorId, session.churchId, session.userId, session.email);

    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
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
