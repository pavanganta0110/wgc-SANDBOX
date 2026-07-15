import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

// Archiving only hides the donor from the default list — every donation,
// subscription, payment method, refund, return, dispute, note, and audit
// record stays attached and queryable. Nothing here is ever hard-deleted.
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canArchive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: session.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }
  if (donor.archivedAt) {
    return NextResponse.json({ success: true, alreadyArchived: true });
  }

  await prisma.donor.update({
    where: { id: donor.id },
    data: { archivedAt: new Date(), archivedByUserId: session.userId, archivedByEmail: session.email },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.archived",
    entityType: "donor",
    entityId: donorId,
    req,
  });

  return NextResponse.json({ success: true });
}
