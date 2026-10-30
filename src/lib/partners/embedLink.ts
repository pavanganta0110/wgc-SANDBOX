import crypto from "crypto";

/**
 * The link a partner's server gets from POST /api/v1/partner/embed-links and puts in
 * the iframe it shows inside its own product. It names ONE organization of that
 * partner (the partner's own reference, e.g. a CRM location id) and optionally the
 * person looking at the screen. It is signed with its own context, so no other token
 * (session, partner session, invite) can be used here or the other way round.
 *
 * It is not a login by itself: it only lets the page show that organization's
 * onboarding steps. Once the organization is approved the page signs the owner in with
 * a reduced role (see /partner-embed/enter), which re-checks everything in the database.
 */

export const PARTNER_EMBED_LINK_TTL_SECONDS = 15 * 60;

const SIGNING_CONTEXT = "wgc-partner-embed-link-v1";

export interface PartnerEmbedLinkPayload {
  partnerId: string;
  /** The partner's own id for the organization. */
  reference: string;
  /** The CRM user looking at the screen; the owner is used when empty. */
  email: string | null;
  /** Fills the empty boxes of the application form. The person can change them. */
  prefill: { organizationName?: string; contactName?: string; contactEmail?: string; contactPhone?: string; website?: string };
  /** Unix seconds. */
  exp: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not set — required to sign links.");
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 characters in production.");
  }
  return secret;
}

function sign(payloadB64: string): Buffer {
  return crypto.createHmac("sha256", getSecret()).update(`${SIGNING_CONTEXT}.${payloadB64}`).digest();
}

export function createPartnerEmbedLinkToken(payload: Omit<PartnerEmbedLinkPayload, "exp">, nowMs: number = Date.now()): { token: string; expiresAt: Date } {
  const exp = Math.floor(nowMs / 1000) + PARTNER_EMBED_LINK_TTL_SECONDS;
  const payloadB64 = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  return { token: `${payloadB64}.${sign(payloadB64).toString("base64url")}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPartnerEmbedLinkToken(token: unknown, nowMs: number = Date.now()): PartnerEmbedLinkPayload | null {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [payloadB64, signatureB64, extra] = token.split(".");
  if (!payloadB64 || !signatureB64 || extra !== undefined) return null;

  const expected = sign(payloadB64);
  const actual = Buffer.from(signatureB64, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const p = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<PartnerEmbedLinkPayload>;
    if (typeof p.partnerId !== "string" || typeof p.reference !== "string" || !p.reference || typeof p.exp !== "number") return null;
    if (p.exp < Math.floor(nowMs / 1000)) return null;
    return {
      partnerId: p.partnerId,
      reference: p.reference,
      email: typeof p.email === "string" && p.email ? p.email : null,
      prefill: p.prefill && typeof p.prefill === "object" ? p.prefill : {},
      exp: p.exp,
    };
  } catch {
    return null;
  }
}
