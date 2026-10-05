import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Revoke, not delete — an ApiKey row is kept forever (mirrors this
 * codebase's "never hard-delete a financial/security-relevant record"
 * convention) so ApiRequestLog history and the audit trail stay
 * meaningful after a key is retired. */
export async function DELETE(req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const { keyId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageApiKeys");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.apiKey.findFirst({ where: { id: keyId, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  if (existing.status === "REVOKED") return NextResponse.json({ ok: true, alreadyRevoked: true });

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedByUserId: auth.userId },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "api_key.revoked",
    entityType: "ApiKey",
    entityId: keyId,
    metadata: { name: existing.name },
    req,
  });

  return NextResponse.json({ ok: true });
}
