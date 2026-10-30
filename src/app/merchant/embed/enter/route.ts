import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEmbedSessionCookie, consumeEmbedLoginToken, EMBED_ALLOWED_ROLES, EMBED_SESSION_MAX_AGE_SECONDS } from "@/lib/auth/embedLogin";
import { createSessionToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";
import { resolveSafeMerchantRedirect } from "@/lib/safeReturnPath";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Where a partner's iframe lands after the partner requested an embedded login
 * (POST /api/v1/embed/sessions). Spends the one-time link, re-checks the person
 * is still an active, allowed, non-MFA team member, starts their own session, and
 * redirects into the dashboard. Any problem sends the frame to the normal login
 * page and never says why — an unknown, expired or already-used link all look alike.
 */
export async function GET(req: Request) {
  const failure = () => NextResponse.redirect(new URL("/merchant/login", req.url), 303);

  const consumed = await consumeEmbedLoginToken(new URL(req.url).searchParams.get("token") ?? "");
  if (!consumed) return failure();

  const user = await prisma.user.findFirst({
    where: { id: consumed.userId, churchId: consumed.churchId },
    select: { id: true, email: true, role: true, churchId: true, authVersion: true, disabledAt: true, mfaEnabled: true },
  });
  if (!user || !user.churchId || user.disabledAt || user.mfaEnabled || !(EMBED_ALLOWED_ROLES as readonly string[]).includes(user.role)) {
    return failure();
  }

  const sessionToken = createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role as "fundraiser" | "viewer",
    churchId: user.churchId,
    authVersion: user.authVersion,
  }, EMBED_SESSION_MAX_AGE_SECONDS);

  const destination = resolveSafeMerchantRedirect(consumed.redirectTo, "/merchant/dashboard");
  const res = NextResponse.redirect(new URL(destination, req.url), 303);
  res.headers.append("Set-Cookie", buildEmbedSessionCookie(SESSION_COOKIE_NAME, sessionToken));
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");

  try {
    await logDashboardAction({
      churchId: user.churchId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "auth.embed_session_started",
      entityType: "user",
      entityId: user.id,
      metadata: { apiKeyId: consumed.apiKeyId },
      req,
    });
  } catch (err) {
    console.error("Failed to audit embed session start:", err);
  }
  return res;
}
