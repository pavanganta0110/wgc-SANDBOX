import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

// Archiving only hides the donor from the default list — every donation,
// subscription, payment method, refund, return, dispute, note, and audit
// record stays attached and queryable. Nothing here is ever hard-deleted.
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canArchive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }
  if (donor.archivedAt) {
    return NextResponse.json({ success: true, alreadyArchived: true });
  }

  await prisma.donor.update({
    where: { id: donor.id },
    data: { archivedAt: new Date(), archivedByUserId: auth.userId, archivedByEmail: auth.email },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.archived",
    entityType: "donor",
    entityId: donorId,
    req,
  });

  return NextResponse.json({ success: true });
}
