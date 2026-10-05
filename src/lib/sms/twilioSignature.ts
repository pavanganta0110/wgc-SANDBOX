import crypto from "crypto";

/** Twilio's documented request-validation algorithm: sort the POST params
 * by key, append each key+value directly to the callback URL (no
 * separators), HMAC-SHA1 with the auth token, base64-encode, and compare
 * to the X-Twilio-Signature header. Shared by every Twilio webhook in this
 * app — the one thing that must be identical across all of them. */
export function verifyTwilioSignature(authToken: string, url: string, params: URLSearchParams, signature: string): boolean {
  const sortedKeys = Array.from(new Set(params.keys())).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params.get(key);
  }

  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
