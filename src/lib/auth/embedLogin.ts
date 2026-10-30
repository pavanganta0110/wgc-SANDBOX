import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Embedded login for a partner platform (for example a CRM that shows the WGC
 * dashboard in an iframe). The partner's server asks WGC, with its API key, for a
 * login link for ONE named staff member of that organization; the iframe opens
 * the link and WGC starts that person's own session. Because the session is the
 * staff member's own, everything they can see or do is exactly their normal
 * permissions — a fundraiser still only sees donors tied to their own gifts.
 *
 * Guardrails, all enforced here rather than trusted from the caller:
 *  - the church comes from the API key, never the request; the person is looked
 *    up inside that church by email;
 *  - only the roles in EMBED_ALLOWED_ROLES can be started this way — never an
 *    owner or admin, so a leaked partner key can't reach bank, billing, team or
 *    API-key settings (those staff sign in directly);
 *  - a person who has turned on MFA is refused, since this path doesn't do the
 *    code step and shouldn't quietly bypass a protection they chose;
 *  - the link is random, stored only as a SHA-256 hash, works once, and expires in
 *    EMBED_LOGIN_TTL_SECONDS.
 */

export const EMBED_LOGIN_TTL_SECONDS = 60;
export const EMBED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export const EMBED_ALLOWED_ROLES = ["fundraiser", "viewer"] as const;

export type EmbedLoginErrorCode = "user_not_found" | "user_disabled" | "role_not_allowed" | "mfa_enabled";

export class EmbedLoginError extends Error {
  constructor(
    public readonly code: EmbedLoginErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EmbedLoginError";
  }
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export interface CreateEmbedLoginTokenParams {
  /** From the authenticated API key — never from the request body. */
  churchId: string;
  email: string;
  /** An in-app /merchant/... path to land on; validated by the caller. */
  redirectTo?: string | null;
  apiKeyId?: string | null;
}

export async function createEmbedLoginToken(params: CreateEmbedLoginTokenParams): Promise<{ token: string; expiresAt: Date; userId: string }> {
  const email = params.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { churchId: params.churchId, email },
    select: { id: true, role: true, disabledAt: true, mfaEnabled: true },
  });

  if (!user) throw new EmbedLoginError("user_not_found", "No team member with that email in this organization.");
  if (user.disabledAt) throw new EmbedLoginError("user_disabled", "That team member's account is disabled.");
  if (!(EMBED_ALLOWED_ROLES as readonly string[]).includes(user.role)) {
    throw new EmbedLoginError("role_not_allowed", "Embedded login is only available to fundraiser and viewer accounts. Owners and admins sign in directly.");
  }
  if (user.mfaEnabled) {
    throw new EmbedLoginError("mfa_enabled", "That team member uses MFA, so they must sign in directly.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EMBED_LOGIN_TTL_SECONDS * 1000);
  await prisma.embedLoginToken.create({
    data: {
      tokenHash: hashToken(token),
      churchId: params.churchId,
      userId: user.id,
      apiKeyId: params.apiKeyId ?? null,
      redirectTo: params.redirectTo ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt, userId: user.id };
}

export interface ConsumedEmbedLogin {
  userId: string;
  churchId: string;
  redirectTo: string | null;
  apiKeyId: string | null;
}

/**
 * Atomically spends a link. The single conditional update is what makes it
 * single-use: two requests racing on the same link can't both win. Returns null
 * for an unknown, expired or already-used link — callers must not say which.
 */
export async function consumeEmbedLoginToken(rawToken: string): Promise<ConsumedEmbedLogin | null> {
  if (!rawToken || rawToken.length > 200) return null;
  const tokenHash = hashToken(rawToken);

  const claimed = await prisma.embedLoginToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  const row = await prisma.embedLoginToken.findUnique({
    where: { tokenHash },
    select: { userId: true, churchId: true, redirectTo: true, apiKeyId: true },
  });
  return row ?? null;
}

/**
 * The Set-Cookie value for an embedded session. It's the same signed session
 * cookie as a normal login so every existing session check works unchanged, but
 * with the attributes a cross-site iframe needs: SameSite=None; Secure; and
 * Partitioned, so the browser only sends it when WGC is framed by the same
 * top-level site that started it, never from any other site.
 */
export function buildEmbedSessionCookie(cookieName: string, sessionToken: string, maxAgeSeconds: number = EMBED_SESSION_MAX_AGE_SECONDS): string {
  return [
    `${cookieName}=${sessionToken}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
  ].join("; ");
}
