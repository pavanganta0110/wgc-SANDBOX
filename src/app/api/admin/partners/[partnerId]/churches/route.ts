import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";

/** Links an organization to this partner (with the partner's own reference for it). */
export async function POST(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;

  const body = await req.json().catch(() => ({}));
  const churchId = typeof body.churchId === "string" ? body.churchId : "";
  const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim().slice(0, 120) : null;
  if (!churchId) return NextResponse.json({ error: "Choose an organization." }, { status: 400 });

  const [partner, church] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } }),
    prisma.church.findUnique({ where: { id: churchId }, select: { id: true, partnerId: true } }),
  ]);
  if (!partner) return NextResponse.json({ error: "Partner not found." }, { status: 404 });
  if (!church) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (church.partnerId && church.partnerId !== partnerId) {
    return NextResponse.json({ error: "That organization is already linked to another partner. Unlink it there first." }, { status: 409 });
  }

  try {
    await prisma.church.update({ where: { id: churchId }, data: { partnerId, partnerReference: reference } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Another organization of this partner already uses that reference." }, { status: 409 });
    }
    throw err;
  }
  await createAuditLog({ action: "PARTNER_ORGANIZATION_LINKED", actorEmail: auth.session.email, metadata: { partnerId, churchId, reference } });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;

  const body = await req.json().catch(() => ({}));
  const churchId = typeof body.churchId === "string" ? body.churchId : "";
  if (!churchId) return NextResponse.json({ error: "Choose an organization." }, { status: 400 });

  const result = await prisma.church.updateMany({ where: { id: churchId, partnerId }, data: { partnerId: null, partnerReference: null } });
  if (result.count !== 1) return NextResponse.json({ error: "That organization isn't linked to this partner." }, { status: 404 });
  await createAuditLog({ action: "PARTNER_ORGANIZATION_UNLINKED", actorEmail: auth.session.email, metadata: { partnerId, churchId } });
  return NextResponse.json({ success: true });
}
