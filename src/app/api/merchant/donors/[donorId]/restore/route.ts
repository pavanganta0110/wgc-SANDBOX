import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canRestore) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: session.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }
  if (!donor.archivedAt) {
    return NextResponse.json({ success: true, alreadyActive: true });
  }

  await prisma.donor.update({
    where: { id: donor.id },
    data: { archivedAt: null, archivedByUserId: null, archivedByEmail: null },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.restored",
    entityType: "donor",
    entityId: donorId,
    req,
  });

  return NextResponse.json({ success: true });
}
