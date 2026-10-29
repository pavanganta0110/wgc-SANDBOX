import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";

/**
 * Removes someone's access to this partner account. They are signed out at once (authVersion
 * changes). You can't remove yourself, and the account must keep at least one active person.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await requirePartnerSession();
    const { userId } = await params;
    if (userId === session.partnerUserId) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });

    const target = await prisma.partnerUser.findFirst({ where: { id: userId, partnerId: session.partnerId }, select: { id: true, email: true, disabledAt: true } });
    if (!target) return NextResponse.json({ error: "Person not found." }, { status: 404 });
    if (target.disabledAt) return NextResponse.json({ error: "Already removed." }, { status: 409 });

    const othersActive = await prisma.partnerUser.count({
      where: { partnerId: session.partnerId, id: { not: userId }, disabledAt: null, passwordHash: { not: null } },
    });
    if (othersActive < 1) return NextResponse.json({ error: "Keep at least one active person on the account." }, { status: 409 });

    await prisma.partnerUser.update({
      where: { id: userId },
      data: { disabledAt: new Date(), authVersion: { increment: 1 }, setPasswordTokenHash: null, setPasswordTokenExpiresAt: null, mfaCodeHash: null, mfaChallengeHash: null },
    });
    await createAuditLog({ action: "PARTNER_TEAM_REMOVED", actorEmail: session.email, metadata: { partnerId: session.partnerId, removedEmail: target.email } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
