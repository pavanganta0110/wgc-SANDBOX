import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { startImpersonation } from "@/lib/auth/impersonation";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Starts a "View as Merchant" admin impersonation session for the given
 * church. Gated to wgc_super_admin only — this is the single most
 * privileged action available anywhere in the admin panel (full read/write
 * access to any organization's real dashboard), and there is no existing
 * granular per-admin permission system to gate it more finely (the only
 * admin-side role split in this codebase is wgc_admin vs wgc_super_admin).
 * If finer-grained control is wanted later, add a dedicated boolean
 * permission column rather than expanding this role split.
 *
 * Requires an MFA-verified session (requireMfaVerifiedAdminSession) — not
 * just the admin dashboard layout's redirect gate. A direct POST from a
 * password-only or pre-enrollment session must fail here at the API level,
 * since the layout gate only protects page navigation, not direct API
 * calls. See requireAdminSession.ts for why this checks the CURRENT
 * session's OTP-verification status rather than the account's mfaEnabled
 * flag.
 *
 * churchId is read only from the URL path param — never from the request
 * body — so there is no way for a client-supplied payload to target a
 * different organization than the one this route was actually called for.
 */
export async function POST(req: Request, context: { params: Promise<{ churchId: string }> }) {
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Only WGC super admins can view a merchant's dashboard." }, { status: 403 });
  }

  const { churchId } = await context.params;

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { id: true, name: true, status: true },
  });
  if (!church) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (church.status !== "ACTIVE") {
    return NextResponse.json({ error: "This organization is not active and cannot be viewed as a merchant." }, { status: 409 });
  }

  const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent") || null;

  const impersonationSessionId = await startImpersonation({
    adminUserId: session.userId,
    adminEmail: session.email,
    targetChurchId: church.id,
    targetChurchName: church.name,
    ipAddress,
    userAgent,
  });

  await logDashboardAction({
    churchId: church.id,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "ADMIN_IMPERSONATION_STARTED",
    metadata: { impersonationSessionId, targetChurchId: church.id },
    req,
  });

  return NextResponse.json({ redirectTo: "/merchant/dashboard" });
}
