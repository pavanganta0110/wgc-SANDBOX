import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canCreate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { linkId } = await params;
  const link = await prisma.subscriptionSetupLink.findFirst({ where: { id: linkId, churchId: auth.churchId } });
  if (!link) return NextResponse.json({ error: "Setup link not found" }, { status: 404 });
  if (link.status === "COMPLETED") return NextResponse.json({ error: "This setup link has already been completed" }, { status: 400 });
  if (link.status === "REVOKED") return NextResponse.json({ link });

  const updated = await prisma.subscriptionSetupLink.update({
    where: { id: link.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedByUserId: auth.userId },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "subscription.setup_link_revoked",
    entityType: "subscription_setup_link",
    entityId: link.id,
    req,
  });

  return NextResponse.json({ link: updated });
}
