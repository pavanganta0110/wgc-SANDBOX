import crypto from "crypto";

/**
 * Partner API keys: `wgc_ptr_test_…` in sandbox, `wgc_ptr_live_…` in production.
 * The prefix keeps them from ever matching an organization key (`wgc_live_…`),
 * and the label makes a sandbox key recognisable at a glance. Only the SHA-256
 * hash is stored; the key is shown once, when it is created.
 */

export const PARTNER_KEY_PREFIX = "wgc_ptr_";
export const MAX_ACTIVE_PARTNER_KEYS = 5;

/** "live" only when the deployment says it talks to live Finix; anything else is "test". */
export function partnerKeyEnvironment(finixEnvironment: string | undefined = process.env.FINIX_ENVIRONMENT): "test" | "live" {
  const value = (finixEnvironment ?? "").trim().toLowerCase();
  return value === "live" || value === "production" ? "live" : "test";
}

export function generatePartnerApiKey(environment: "test" | "live" = partnerKeyEnvironment()): string {
  return `${PARTNER_KEY_PREFIX}${environment}_${crypto.randomBytes(24).toString("base64url")}`;
}

export function hashPartnerApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Enough to recognise the key in a list, never enough to use it. */
export function partnerKeyPrefixFor(plaintext: string): string {
  return plaintext.slice(0, 18) + "...";
}
