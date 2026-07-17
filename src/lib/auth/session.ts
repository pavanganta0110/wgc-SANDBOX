import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "wgc_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  email: string;
  role: "wgc_super_admin" | "wgc_admin" | "church_admin";
  churchId: string | null;
  // Epoch ms of User.passwordChangedAt at the moment this token was
  // issued, or null if the password has never been reset. Compared
  // against the current DB value by getAdminSession() to invalidate
  // every token issued before a password reset — the only way to revoke
  // our stateless HMAC-signed cookies without a server-side session store.
  passwordChangedAt: number | null;
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
  return verifySessionToken(token);
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
 * Costs one query per protected admin request, same tradeoff the rest of
 * this codebase already makes for role checks.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const payload = await getSession();
  if (!payload) return null;
  if (payload.role !== "wgc_admin" && payload.role !== "wgc_super_admin") return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, disabledAt: true, passwordChangedAt: true },
  });
  if (!user || user.disabledAt) return null;
  if (user.role !== "wgc_admin" && user.role !== "wgc_super_admin") return null;

  const dbChangedAt = user.passwordChangedAt ? user.passwordChangedAt.getTime() : null;
  if (dbChangedAt !== payload.passwordChangedAt) return null;

  return { userId: user.id, email: user.email, name: user.name, role: user.role as "wgc_super_admin" | "wgc_admin" };
}
