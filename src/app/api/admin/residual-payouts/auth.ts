import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import type { AdminSession } from "@/lib/auth/session";

/** Recording residual payouts changes WGC's own revenue books: billing managers only, MFA-verified. */
export async function requireResidualManager(): Promise<{ session: AdminSession } | { error: NextResponse }> {
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return { error: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManageBilling) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  return { session };
}
