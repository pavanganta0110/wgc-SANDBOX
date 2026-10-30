import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession, requirePartnerWriteSession } from "@/lib/partners/partnerSession";
import {
  EMBEDDED_MENU_ALWAYS_ON,
  EMBEDDED_MENU_CATALOG,
  allowedEmbeddedHrefs,
  buildEmbeddedMenuChoice,
  newEmbeddedMenuItems,
} from "@/lib/partners/embeddedMenu";

/** The items, which are on, and which are new since the last save. `saved` is false until a choice is saved (everything shows). */
export async function GET() {
  try {
    const session = await requirePartnerSession();
    const partner = await prisma.partner.findUnique({ where: { id: session.partnerId }, select: { embeddedMenuJson: true } });
    const allowed = allowedEmbeddedHrefs(partner?.embeddedMenuJson);
    return NextResponse.json({
      items: EMBEDDED_MENU_CATALOG,
      alwaysOn: EMBEDDED_MENU_ALWAYS_ON,
      saved: allowed !== null,
      allowed: allowed ?? EMBEDDED_MENU_CATALOG.map((i) => i.href),
      newItems: newEmbeddedMenuItems(partner?.embeddedMenuJson).map((i) => i.href),
    });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Saves the ticked items for the partner's own organizations. Body: { allowed: string[] }. */
export async function PUT(req: Request) {
  try {
    const session = await requirePartnerWriteSession();
    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.allowed)) return NextResponse.json({ error: "Choose the items to show." }, { status: 400 });

    const choice = buildEmbeddedMenuChoice(body.allowed);
    await prisma.partner.update({ where: { id: session.partnerId }, data: { embeddedMenuJson: { allowed: choice.allowed, known: choice.known } } });
    await createAuditLog({ action: "PARTNER_MENU_SAVED", actorEmail: session.email, metadata: { partnerId: session.partnerId, shown: choice.allowed.length } });
    return NextResponse.json({ saved: true, allowed: choice.allowed });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
