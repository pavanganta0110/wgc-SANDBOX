import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export { SESSION_COOKIE_NAME } from "./sessionConstants";
import { SESSION_COOKIE_NAME } from "./sessionConstants";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  email: string;
  // "church_admin" kept for backward compatibility with any session token
  // signed before the Checkpoint 1 role expansion — verifySessionToken
  // doesn't reject it, callers should treat it as equivalent to "admin".
  role: "wgc_super_admin" | "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";
  churchId: string | null;
  // Team-access Checkpoint 1: the User.authVersion value at sign-in time.
  // getSession() re-checks this against the live DB value on every call —
  // see the comment there for why. Optional or missing on tokens signed
  // before this field existed; those are treated as version 0, which will
  // never equal a real user's authVersion (starts at 1), so any session
  // issued before this migration is naturally invalidated on next check
  // rather than silently trusted.
  authVersion?: number;
  // Epoch ms of User.passwordChangedAt at the moment this token was
  // issued, or null if the password has never been reset. Used only by
  // getAdminSession() (the internal WGC admin-panel auth path) to
  // invalidate every token issued before a password reset. Optional
  // because merchant-side logins (Team-access) don't set this — they use
  // authVersion instead (see above).
  passwordChangedAt?: number | null;
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set — required to sign session cookies.");
  }
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 characters in production.");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Custom signed-cookie session (HMAC-SHA256 over a JSON payload), not a
 * library — matches this codebase's existing preference for no new heavy
 * dependencies. Format: base64url(payload).base64url(signature)
 */
export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const signature = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(signature)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  const expectedSignature = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const actualSignature = Buffer.from(signatureB64, "base64url");

  if (
    expectedSignature.length !== actualSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const token = createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  // Team-access Checkpoint 1: this used to be a purely stateless check
  // (signature + expiry only) — a role change, permission change, or
  // disable took effect only once the 7-day cookie naturally expired.
  // Now every call re-reads the live DB row and rejects the session if
  // authVersion has moved on (bumped by bumpAuthVersion(), called on
  // every role/permission/status change) or the user has been disabled
  // since the token was issued. This adds one indexed lookup per
  // authenticated request — acceptable here since every merchant/admin
  // page and API route already calls getSession() once per request
  // regardless.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { authVersion: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return null;
  if ((payload.authVersion ?? 0) !== user.authVersion) return null;

  return payload;
}

export interface AdminSession {
  userId: string;
  email: string;
  name: string | null;
  role: "wgc_super_admin" | "wgc_admin";
}

/**
 * Admin-only session check with real DB-backed invalidation — every call
 * re-checks the account isn't disabled and that the token's embedded
 * passwordChangedAt still matches the DB, so a password reset immediately
 * revokes every other session even though the cookie itself is stateless.
 * Costs one query per protected admin request, same tradeoff getSession()
 * already makes for role checks. Unrelated to and unaffected by
 * getSession()'s authVersion check — the WGC internal admin panel and the
 * merchant dashboard use two independent invalidation mechanisms on the
 * same session-cookie infrastructure.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  // Signature + expiry only, deliberately not getSession() — that also
  // gates on User.authVersion, a merchant-session-only invalidation
  // mechanism admin logins don't participate in. The DB-backed checks
  // below (disabledAt, passwordChangedAt) are this path's own equivalent.
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (payload.role !== "wgc_admin" && payload.role !== "wgc_super_admin") return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, disabledAt: true, passwordChangedAt: true },
  });
  if (!user || user.disabledAt) return null;
  if (user.role !== "wgc_admin" && user.role !== "wgc_super_admin") return null;

  const dbChangedAt = user.passwordChangedAt ? user.passwordChangedAt.getTime() : null;
  if (dbChangedAt !== (payload.passwordChangedAt ?? null)) return null;

  return { userId: user.id, email: user.email, name: user.name, role: user.role as "wgc_super_admin" | "wgc_admin" };
}

/**
 * Call after any change to a user's role, permissionsJson, disabledAt, or
 * bank-management permission — invalidates every session issued before
 * the change (see getSession()'s authVersion comparison above). Does not
 * touch the session cookie itself; the next request from that browser
 * will simply fail getSession() and get redirected to login.
 */
export async function bumpAuthVersion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { authVersion: { increment: 1 } },
  });
}
