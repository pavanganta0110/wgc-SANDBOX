import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { getAdminSession } from "@/lib/auth/session";
import { PARTNER_SESSION_COOKIE_NAME } from "./partnerSessionConstants";

/**
 * Session for partner staff (a PartnerUser). It is deliberately its own cookie,
 * its own token format and its own signing context, so a partner token can never
 * be accepted as an organization or admin session and the reverse: those
 * sessions are looked up by a User id, this one by a PartnerUser id.
 *
 * Like the organization session, it is checked against the database on every
 * call (not disabled, partner still ACTIVE, authVersion unchanged), so disabling
 * someone or changing their password takes effect immediately.
 */

export const PARTNER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
/** An admin's read-only look at a partner's dashboard is short. */
export const PARTNER_VIEW_AS_MAX_AGE_SECONDS = 60 * 60;

// Mixed into the signature so a token signed for another purpose with the same
// secret can't be replayed here.
const SIGNING_CONTEXT = "wgc-partner-session-v1";

export interface PartnerSessionPayload {
  partnerUserId: string;
  partnerId: string;
  authVersion: number;
  /** Set when a WGC super admin is looking at the partner's dashboard (read-only), not a partner user. */
  viewAsAdminUserId?: string;
  /** Unix seconds. */
  exp: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not set — required to sign session cookies.");
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 characters in production.");
  }
  return secret;
}

function sign(payloadB64: string): Buffer {
  return crypto.createHmac("sha256", getSecret()).update(`${SIGNING_CONTEXT}.${payloadB64}`).digest();
}

export function createPartnerSessionToken(payload: Omit<PartnerSessionPayload, "exp">, nowMs: number = Date.now()): string {
  const lifetime = payload.viewAsAdminUserId ? PARTNER_VIEW_AS_MAX_AGE_SECONDS : PARTNER_SESSION_MAX_AGE_SECONDS;
  const full: PartnerSessionPayload = { ...payload, exp: Math.floor(nowMs / 1000) + lifetime };
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64).toString("base64url")}`;
}

export function verifyPartnerSessionToken(token: string, nowMs: number = Date.now()): PartnerSessionPayload | null {
  const [payloadB64, signatureB64, extra] = token.split(".");
  if (!payloadB64 || !signatureB64 || extra !== undefined) return null;

  const expected = sign(payloadB64);
  const actual = Buffer.from(signatureB64, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<PartnerSessionPayload>;
    if (
      typeof payload.partnerUserId !== "string" ||
      typeof payload.partnerId !== "string" ||
      typeof payload.authVersion !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(nowMs / 1000)) return null;
    if (payload.viewAsAdminUserId !== undefined && typeof payload.viewAsAdminUserId !== "string") return null;
    return payload as PartnerSessionPayload;
  } catch {
    return null;
  }
}

export async function setPartnerSessionCookie(user: { id: string; partnerId: string; authVersion: number }) {
  const token = createPartnerSessionToken({ partnerUserId: user.id, partnerId: user.partnerId, authVersion: user.authVersion });
  const cookieStore = await cookies();
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PARTNER_SESSION_MAX_AGE_SECONDS,
  });
}

/** An admin's read-only look at a partner. Not a partner user: nothing in it can write. */
export async function setPartnerViewAsCookie(partnerId: string, adminUserId: string) {
  const token = createPartnerSessionToken({ partnerUserId: `admin:${adminUserId}`, partnerId, authVersion: 0, viewAsAdminUserId: adminUserId });
  const cookieStore = await cookies();
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PARTNER_VIEW_AS_MAX_AGE_SECONDS,
  });
}

export async function clearPartnerSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PARTNER_SESSION_COOKIE_NAME);
}

export interface PartnerSession {
  partnerUserId: string;
  partnerId: string;
  partnerName: string;
  email: string;
  name: string | null;
  /** True for a WGC admin looking at the dashboard: reads work, every change is refused. */
  readOnly?: boolean;
}

/** The signed-in partner staff member, or null. Every check below is re-read from the database. */
export async function getPartnerSession(): Promise<PartnerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyPartnerSessionToken(token);
  if (!payload) return null;

  if (payload.viewAsAdminUserId) {
    // A WGC super admin looking at the dashboard. It lasts only while that same admin is still
    // signed in, so signing out of the admin ends it.
    const admin = await getAdminSession();
    if (!admin || admin.userId !== payload.viewAsAdminUserId || admin.role !== "wgc_super_admin") return null;
    const partner = await prisma.partner.findUnique({ where: { id: payload.partnerId }, select: { name: true } });
    if (!partner) return null;
    return { partnerUserId: payload.partnerUserId, partnerId: payload.partnerId, partnerName: partner.name, email: admin.email, name: admin.name, readOnly: true };
  }

  const user = await prisma.partnerUser.findUnique({
    where: { id: payload.partnerUserId },
    select: {
      id: true,
      partnerId: true,
      email: true,
      name: true,
      disabledAt: true,
      authVersion: true,
      partner: { select: { name: true, status: true } },
    },
  });
  if (!user || user.disabledAt) return null;
  if (user.partnerId !== payload.partnerId) return null;
  if (user.authVersion !== payload.authVersion) return null;
  if (user.partner.status !== "ACTIVE") return null;

  return { partnerUserId: user.id, partnerId: user.partnerId, partnerName: user.partner.name, email: user.email, name: user.name };
}

export async function requirePartnerSession(): Promise<PartnerSession> {
  const session = await getPartnerSession();
  if (!session) throw new UnauthorizedError("Partner sign-in required.");
  return session;
}

/** For everything that changes something: refuses an admin's read-only view. */
export async function requirePartnerWriteSession(): Promise<PartnerSession> {
  const session = await requirePartnerSession();
  if (session.readOnly) throw new ForbiddenError("This is a read-only view of the partner's dashboard. Changes are turned off.");
  return session;
}
