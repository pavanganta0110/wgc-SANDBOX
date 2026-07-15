import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canCreate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { linkId } = await params;
  const link = await prisma.subscriptionSetupLink.findFirst({ where: { id: linkId, churchId: session.churchId } });
  if (!link) return NextResponse.json({ error: "Setup link not found" }, { status: 404 });
  if (link.status === "COMPLETED") return NextResponse.json({ error: "This setup link has already been completed" }, { status: 400 });
  if (link.status === "REVOKED") return NextResponse.json({ link });

  const updated = await prisma.subscriptionSetupLink.update({
    where: { id: link.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedByUserId: session.userId },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "subscription.setup_link_revoked",
    entityType: "subscription_setup_link",
    entityId: link.id,
    req,
  });

  return NextResponse.json({ link: updated });
}
