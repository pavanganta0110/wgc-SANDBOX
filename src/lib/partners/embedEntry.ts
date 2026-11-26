import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { buildEmbedSessionCookie } from "@/lib/auth/embedLogin";
import { createSessionToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { PARTNER_EMBED_SESSION_SECONDS, type PartnerEmbedLinkPayload } from "./embedLink";

/** The roles a person can hold and still be opened inside a partner's frame. */
export const EMBED_ROLES = ["owner", "admin", "fundraiser", "viewer"];

/**
 * How people are identified when WGC is shown inside a partner's product:
 *  - CRM_IDENTITY: the partner's page says who is opening it (the partner has a login per person);
 *  - PASSCODE: the partner's product has one shared login, so each person types their email and their own passcode;
 *  - EMAIL_CODE: also one shared login, but WGC emails a one-time code to the address the person types, if that address is on the organization's team.
 */
export const EMBED_SIGN_IN_MODES = ["CRM_IDENTITY", "PASSCODE", "EMAIL_CODE"] as const;
export type EmbedSignInMode = (typeof EMBED_SIGN_IN_MODES)[number];

export const isEmbedSignInMode = (value: unknown): value is EmbedSignInMode => typeof value === "string" && (EMBED_SIGN_IN_MODES as readonly string[]).includes(value);

export async function getEmbedSignInMode(partnerId: string): Promise<EmbedSignInMode> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { embedSignInMode: true } });
  return isEmbedSignInMode(partner?.embedSignInMode) ? partner.embedSignInMode : "CRM_IDENTITY";
}

/** A link opens a dashboard once. The first use is stored; a second use hits the unique key. */
export async function claimEmbedLink(payload: Pick<PartnerEmbedLinkPayload, "jti" | "partnerId" | "exp">): Promise<"claimed" | "used"> {
  try {
    await prisma.partnerEmbedEntry.create({
      data: { jtiHash: crypto.createHash("sha256").update(payload.jti).digest("hex"), partnerId: payload.partnerId, expiresAt: new Date(payload.exp * 1000) },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return "used";
    throw err;
  }
  // Old rows are only there to refuse a repeat, so clear the ones past their link's life. Never blocks the sign-in.
  if (Math.random() < 0.02) {
    void prisma.partnerEmbedEntry.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }).catch(() => undefined);
  }
  return "claimed";
}

export interface EmbedUser {
  id: string;
  email: string;
  role: string;
  churchId: string;
  authVersion: number;
}

/** The session cookie for a person opened in a partner's frame. An owner works as a reduced administrator. */
export function buildEmbedSessionCookieFor(user: EmbedUser): string {
  const sessionToken = createSessionToken(
    {
      userId: user.id,
      email: user.email,
      role: (user.role === "owner" ? "admin" : user.role) as "admin" | "fundraiser" | "viewer",
      churchId: user.churchId,
      authVersion: user.authVersion,
      embedded: true,
    },
    PARTNER_EMBED_SESSION_SECONDS
  );
  return buildEmbedSessionCookie(SESSION_COOKIE_NAME, sessionToken, PARTNER_EMBED_SESSION_SECONDS);
}

export async function auditEmbedSessionStart(user: EmbedUser, partnerId: string, via: "partner_embed_link" | "partner_embed_passcode" | "partner_embed_email_code", req: Request) {
  // These people never set a password, so this is the only sign-in the Team page can show ("Last active"), and
  // what stops them being listed as a pending invitation. Never blocks the sign-in.
  try {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  } catch (err) {
    console.error("Failed to record the embedded sign-in time:", err);
  }
  try {
    await logDashboardAction({
      churchId: user.churchId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "auth.embed_session_started",
      entityType: "user",
      entityId: user.id,
      metadata: { partnerId, via },
      req,
    });
  } catch (err) {
    console.error("Failed to audit partner embed session start:", err);
  }
}
