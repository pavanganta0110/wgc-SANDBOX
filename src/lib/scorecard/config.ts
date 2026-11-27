import crypto from "crypto";

/**
 * Settings for the fundraising scorecard (fund.wgcpayments.com). Everything that can differ between the sandbox
 * and live comes from the environment; nothing secret is in the code.
 */
/**
 * The giving link's slug from what was typed in the setting. A person may paste the whole link
 * (https://.../g/SLUG or .../embed/SLUG) instead of the slug; the slug is the last part of the address.
 */
export function normalizeSlug(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^[A-Za-z0-9_-]{4,64}$/.test(value)) return value;
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    return /^[A-Za-z0-9_-]{4,64}$/.test(last) ? last : "";
  } catch {
    const last = value.split(/[/?#]/).filter(Boolean).pop() ?? "";
    return /^[A-Za-z0-9_-]{4,64}$/.test(last) ? last : "";
  }
}

export function scorecardConfig() {
  return {
    site: (process.env.SCORECARD_SITE_URL || "https://fund.wgcpayments.com").replace(/\/$/, ""),
    consult: process.env.SCORECARD_CONSULT_URL || "https://calendly.com/waypoint-gateway-collective/wgc-free-strategy-call",
    plan: process.env.SCORECARD_PLAN_URL || "", // the $500 report review + strategy hour checkout, once it exists
    postal: process.env.SCORECARD_MAIL_POSTAL_ADDRESS || "",
    priceCents: Number(process.env.SCORECARD_REPORT_PRICE_CENTS || 10000),
    givingLinkSlug: normalizeSlug(process.env.SCORECARD_GIVING_LINK_SLUG) || "IPHa4RsF8WlK",
    // Gemini model names change; the "-latest" names follow Google's current Flash and Pro. Set these to pin one.
    model: process.env.SCORECARD_MODEL || "gemini-flash-latest",
    reportModel: process.env.SCORECARD_REPORT_MODEL || "gemini-pro-latest",
  };
}

/** The secret that signs the unsubscribe and "send the report" links. Null when it is missing or too weak to trust. */
export function scorecardSecret(): string | null {
  const s = process.env.SCORECARD_SECRET;
  if (!s || s.length < 24 || s === "change-me") return null;
  return s;
}

/** A short signature for a value, or null when the secret is not set (links can't be signed, so none are trusted). */
export function sign(value: string): string | null {
  const secret = scorecardSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(String(value)).digest("base64url").slice(0, 22);
}

/** True only when the token is the signature of the value. Constant-time, and false when the secret is not set. */
export function verifySignature(value: string, token: unknown): boolean {
  const expected = sign(value);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/** Strips control characters (line breaks) so text from a visitor can never break an email header. */
export const oneLine = (s: unknown, max = 200) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
