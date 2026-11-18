import crypto from "crypto";

/**
 * Who a bidder is. A bidder proves they own their email with a one-time code, then holds an httpOnly cookie for
 * that one auction. Only hashes are stored: a leaked database cannot be used to sign in as anyone.
 */

export const BIDDER_CODE_TTL_MS = 15 * 60_000;
export const BIDDER_CODE_RESEND_GAP_MS = 60_000;
export const BIDDER_MAX_CODE_ATTEMPTS = 5;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 120 ? name : null;
}

export function cleanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^\d+]/g, "");
  return digits.length >= 7 && digits.length <= 20 ? digits : null;
}

/** Six digits, from the system's secure random source. */
export function generateBidderCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** The code is only 6 digits, so the hash is salted with the auction and email: the same code hashes differently everywhere. */
export function hashBidderCode(code: string, auctionId: string, normalizedEmail: string): string {
  return sha256(`${auctionId}:${normalizedEmail}:${code}`);
}

export function safeEqualHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function newSessionToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

export function hashSessionToken(token: string): string {
  return sha256(token);
}

export function bidderCookieName(auctionId: string): string {
  return `wgc_bidder_${auctionId}`;
}

export function buildBidderCookie(auctionId: string, bidderId: string, token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${bidderCookieName(auctionId)}=${bidderId}.${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

/** Reads this auction's bidder cookie out of a raw Cookie header. */
export function readBidderCookie(cookieHeader: string | null, auctionId: string): { bidderId: string; token: string } | null {
  if (!cookieHeader) return null;
  const name = bidderCookieName(auctionId);
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey !== name) continue;
    const value = rest.join("=");
    const dot = value.indexOf(".");
    if (dot <= 0 || dot === value.length - 1) return null;
    return { bidderId: value.slice(0, dot), token: value.slice(dot + 1) };
  }
  return null;
}
