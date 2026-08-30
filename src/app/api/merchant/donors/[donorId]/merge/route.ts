import { NextResponse } from "next/server";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { mergeDonors, type MergeFieldSelections } from "@/lib/donors/donorMerge";
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
  const permissions = getDonorPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canMerge) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const body = await req.json();
  const duplicateDonorId = typeof body.duplicateDonorId === "string" ? body.duplicateDonorId : "";
  if (!duplicateDonorId) {
    return NextResponse.json({ error: "duplicateDonorId is required" }, { status: 400 });
  }
  const fieldSelections: MergeFieldSelections | undefined =
    body.fieldSelections && typeof body.fieldSelections === "object" ? body.fieldSelections : undefined;

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.merge_started",
    entityType: "donor",
    entityId: donorId,
    metadata: { duplicateDonorId, method: "manual" },
    req,
  });

  try {
    const result = await mergeDonors(donorId, duplicateDonorId, auth.churchId, auth.userId, auth.email, fieldSelections);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "donor.merged",
      entityType: "donor",
      entityId: donorId,
      metadata: { archivedDonorId: duplicateDonorId, reassigned: result.reassigned, method: "manual" },
      req,
    });
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "donor.merge_completed",
      entityType: "donor",
      entityId: donorId,
      metadata: { archivedDonorId: duplicateDonorId, reassigned: result.reassigned },
      req,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "donor.merge_failed",
      entityType: "donor",
      entityId: donorId,
      metadata: { duplicateDonorId, error: message },
      req,
    });
    return NextResponse.json({ error: message || "Failed to merge donors" }, { status: 400 });
  }
}
