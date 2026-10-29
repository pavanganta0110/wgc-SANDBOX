import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";

/** Revokes one of the signed-in partner's own keys. It stops working immediately. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  try {
    const session = await requirePartnerSession();
    const { keyId } = await params;
    const result = await prisma.partnerApiKey.updateMany({
      where: { id: keyId, partnerId: session.partnerId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (result.count !== 1) return NextResponse.json({ error: "Key not found." }, { status: 404 });
    await createAuditLog({ action: "PARTNER_API_KEY_REVOKED", actorEmail: session.email, metadata: { partnerId: session.partnerId, keyId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
