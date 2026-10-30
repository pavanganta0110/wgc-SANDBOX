import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";
import { setPartnerViewAsCookie } from "@/lib/partners/partnerSession";

/**
 * Lets a WGC super admin open a partner's own dashboard to see what its staff see. It is a
 * read-only look: the cookie it sets belongs to no partner user, lasts an hour, ends when the
 * admin signs out, and every change a partner page tries to make is refused. Each use is
 * written to the audit log. Super admins only, with the same two-factor rule as the rest of the
 * Partners page.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;

  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true } });
  if (!partner) return NextResponse.json({ error: "Partner not found." }, { status: 404 });

  await setPartnerViewAsCookie(partner.id, auth.session.userId);
  await createAuditLog({ action: "PARTNER_DASHBOARD_VIEWED_BY_ADMIN", actorEmail: auth.session.email, metadata: { partnerId: partner.id, partnerName: partner.name } });
  return NextResponse.json({ success: true });
}
