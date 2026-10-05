import crypto from "crypto";

/** How long a code (enrollment or login) stays valid before it must be re-sent. */
export const MFA_CODE_TTL_MINUTES = 10;
/** Wrong guesses allowed against one issued code before it's invalidated,
 * forcing a fresh send rather than letting an attacker keep guessing a
 * 6-digit space (1,000,000 possibilities — brute-forceable without a hard
 * cap even with per-request rate limiting alone). */
export const MFA_MAX_CODE_ATTEMPTS = 5;

/** A random 6-digit code, always in the 100000-999999 range (no leading
 * zero, so it's never displayed/typed as a 5-digit number by mistake) —
 * plus its SHA-256 hash, the only form ever persisted. Same
 * generate-plaintext-once / store-hash-only pattern as
 * setupLinkToken.ts, sized for a value a person reads off a text message
 * and types back rather than a link they click. */
export function generateMfaCode(): { code: string; codeHash: string } {
  const code = crypto.randomInt(100000, 1000000).toString();
  return { code, codeHash: hashMfaCode(code) };
}

export function hashMfaCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** Opaque reference to a pending login's MFA challenge, returned to the
 * client instead of the user's real id — the client only ever needs to
 * echo this back, never learns or transmits the actual userId until a
 * session is issued. */
export function generateMfaChallengeId(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** "We texted a code to ***-***-1234" — shows just enough for the user to
 * confirm it's their own number without displaying the whole thing back
 * to whatever's rendering the login/enrollment screen. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}
