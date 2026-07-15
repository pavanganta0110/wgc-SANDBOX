import crypto from "crypto";

/** Same random-token + SHA-256-hash pattern as the existing forgot-password/set-password flow — only the hash is ever stored. */
export function generateSetupLinkToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashSetupLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
