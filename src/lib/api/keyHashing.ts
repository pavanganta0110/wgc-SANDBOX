import crypto from "crypto";

/**
 * API keys are never stored reversibly (unlike a webhook signing secret,
 * which must be decryptable to compute an outgoing signature) — only a
 * one-way SHA-256 hash, looked up on every request. The plaintext key is
 * shown to the merchant exactly once, at creation.
 */
export function generateApiKey(): string {
  return `wgc_live_${crypto.randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export function keyPrefixFor(plaintext: string): string {
  return plaintext.slice(0, 14) + "...";
}
