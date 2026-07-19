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
  role: "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";
  churchId: string | null;
  // Team-access Checkpoint 1: the User.authVersion value at sign-in time.
  // getSession() re-checks this against the live DB value on every call —
  // see the comment there for why. Optional or missing on tokens signed
  // before this field existed; those are treated as version 0, which will
  // never equal a real user's authVersion (starts at 1), so any session
  // issued before this migration is naturally invalidated on next check
  // rather than silently trusted.
  authVersion?: number;
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
