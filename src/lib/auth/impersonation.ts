import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * "View as Merchant" admin impersonation — a cross-tenant, cross-role
 * cousin of wgc_view_scope.ts, deliberately NOT built on top of it.
 * wgc_view_scope's entire trust model hard-rejects the moment a target
 * belongs to a different churchId (see viewScope.ts's
 * cross_organization_target check) — that invariant is exactly what this
 * feature needs to cross, so bending the same cookie/verification path to
 * carry an admin-real-identity + merchant-target-org relationship would mean
 * adding a cross-tenant escape hatch into the one function whose entire job
 * is enforcing "never cross tenants." A separate, narrowly-scoped module is
 * safer to reason about and test in isolation. The signing pattern (HMAC,
 * same AUTH_SESSION_SECRET, re-verify against a live DB row on every read,
 * never trust the cookie's claims alone) is intentionally copied from
 * viewScope.ts/session.ts.
 */

export const IMPERSONATION_COOKIE_NAME = "wgc_impersonation";
const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — matches wgc_view_scope's precedent

interface ImpersonationCookiePayload {
  impersonationSessionId: string;
  /** The real, authenticated admin userId — re-checked against the current
   * admin session's own userId on every read, so this cookie can never be
   * replayed under a different logged-in admin account. */
  adminUserId: string;
  targetChurchId: string;
  exp: number;
}

export interface ActiveImpersonation {
  impersonationSessionId: string;
  adminUserId: string;
  adminEmail: string;
  targetChurchId: string;
  targetChurchName: string;
}

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set — required to sign the impersonation cookie.");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: ImpersonationCookiePayload): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(signature)}`;
}

function verifyToken(token: string): ImpersonationCookiePayload | null {
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const actual = Buffer.from(signatureB64, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const payload: ImpersonationCookiePayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Mints the impersonation session (DB row + signed cookie). Callers must
 * have already verified: the requester is a valid wgc_super_admin session,
 * the target church exists, and the target church is active — this
 * function does not re-derive those checks, it only records the decision.
 * Returns the new impersonationSessionId.
 */
export async function startImpersonation(params: {
  adminUserId: string;
  adminEmail: string;
  targetChurchId: string;
  targetChurchName: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<string> {
  const expiresAtDate = new Date(Date.now() + IMPERSONATION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.adminImpersonationSession.create({
    data: {
      adminUserId: params.adminUserId,
      adminEmail: params.adminEmail,
      targetChurchId: params.targetChurchId,
      targetChurchName: params.targetChurchName,
      expiresAt: expiresAtDate,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });

  const exp = Math.floor(expiresAtDate.getTime() / 1000);
  const payload: ImpersonationCookiePayload = {
    impersonationSessionId: session.id,
    adminUserId: params.adminUserId,
    targetChurchId: params.targetChurchId,
    exp,
  };

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE_NAME, signPayload(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
  });

  return session.id;
}

export async function clearImpersonationCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
}

/**
 * Best-effort cookie removal for contexts where cookies() can't be mutated
 * (a plain Server Component render, e.g. inside requireMerchantSession()
 * during a page load) — mirrors viewScope.ts's tryClearInvalidCookie. A
 * failure to clear here is cleanup, not correctness: the row-level checks
 * below keep failing safely on every future read regardless.
 */
async function tryClearInvalidCookie(): Promise<void> {
  try {
    await clearImpersonationCookie();
  } catch {
    // Not in a context that allows cookie mutation — safe to ignore.
  }
}

/**
 * Ends an impersonation session server-side (DB row only — does not touch
 * the cookie, callers clear that separately). Idempotent: ending an
 * already-ended row is a no-op, not an error.
 */
export async function endImpersonationSession(impersonationSessionId: string, reason: string): Promise<void> {
  await prisma.adminImpersonationSession.updateMany({
    where: { id: impersonationSessionId, endedAt: null },
    data: { endedAt: new Date(), endedReason: reason },
  });
}

/**
 * Resolves and fully re-verifies the current request's impersonation
 * context, if any. Never trusts the cookie's claims alone — every field is
 * re-checked against a live DB row on every call:
 *   1. cookie present, signature valid, not expired (cookie-level exp)
 *   2. cookie's adminUserId matches the real, currently-authenticated admin
 *      (defends against the cookie being replayed under a different
 *      logged-in identity on the same browser)
 *   3. the AdminImpersonationSession row still exists, is not ended, and
 *      has not expired (DB-level exp — this is what makes revocation
 *      immediate rather than only-at-cookie-expiry)
 *   4. the target Church still exists and is still ACTIVE (if it was
 *      disabled/suspended mid-session, the row is ended here with reason
 *      "target_disabled" and this returns null)
 *
 * cache()-memoized so it costs exactly one extra query per request,
 * matching requireMerchantSession()'s own memoization.
 */
export const resolveActiveImpersonation = cache(
  async (currentAdminUserId: string): Promise<ActiveImpersonation | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) {
      await tryClearInvalidCookie();
      return null;
    }

    if (payload.adminUserId !== currentAdminUserId) {
      await tryClearInvalidCookie();
      return null;
    }

    const session = await prisma.adminImpersonationSession.findUnique({
      where: { id: payload.impersonationSessionId },
    });
    if (!session || session.endedAt || session.expiresAt.getTime() < Date.now() || session.adminUserId !== currentAdminUserId) {
      await tryClearInvalidCookie();
      return null;
    }

    const church = await prisma.church.findUnique({
      where: { id: session.targetChurchId },
      select: { id: true, name: true, status: true },
    });
    if (!church || church.status !== "ACTIVE") {
      await endImpersonationSession(session.id, "target_disabled");
      await tryClearInvalidCookie();
      return null;
    }

    return {
      impersonationSessionId: session.id,
      adminUserId: session.adminUserId,
      adminEmail: session.adminEmail,
      targetChurchId: session.targetChurchId,
      targetChurchName: church.name,
    };
  }
);
