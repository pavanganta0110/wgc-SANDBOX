import crypto from "crypto";

/**
 * Outbound webhook HMAC signing — the same scheme WGC's own Finix inbound
 * webhook handler verifies (src/app/api/webhooks/finix/route.ts), mirrored
 * for the sending side so a merchant implementing verification recognizes
 * a familiar `timestamp=<unix>,sig=<hex>` header format. Signed payload is
 * `${timestamp}:${rawBody}`, HMAC-SHA256, hex-encoded.
 */
export function signWebhookPayload(rawBody: string, secret: string, timestamp: number): string {
  const payloadToSign = `${timestamp}:${rawBody}`;
  const sig = crypto.createHmac("sha256", secret).update(payloadToSign, "utf-8").digest("hex");
  return `timestamp=${timestamp},sig=${sig}`;
}

/** For a merchant's own reference implementation / our test-send verification. */
export function verifyWebhookSignature(rawBody: string, secret: string, header: string, maxAgeSeconds = 300): boolean {
  const match = /^timestamp=(\d+),sig=([0-9a-f]+)$/.exec(header);
  if (!match) return false;
  const timestamp = Number(match[1]);
  const providedSig = match[2];

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > maxAgeSeconds) return false;

  const expectedSig = crypto.createHmac("sha256", secret).update(`${timestamp}:${rawBody}`, "utf-8").digest("hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  const providedBuf = Buffer.from(providedSig, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function generateSigningSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}
