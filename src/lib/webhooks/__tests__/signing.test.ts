import { describe, it, expect } from "vitest";
import { signWebhookPayload, verifyWebhookSignature, generateSigningSecret } from "../signing";

describe("signWebhookPayload / verifyWebhookSignature", () => {
  it("round-trips: a signature produced by signWebhookPayload verifies successfully", () => {
    const body = JSON.stringify({ id: "evt_1", type: "donation.created" });
    const secret = "whsec_test123";
    const timestamp = Math.floor(Date.now() / 1000);

    const header = signWebhookPayload(body, secret, timestamp);
    expect(header).toBe(`timestamp=${timestamp},sig=${header.split("sig=")[1]}`);
    expect(verifyWebhookSignature(body, secret, header)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(body, "secret-a", timestamp);

    expect(verifyWebhookSignature(body, "secret-b", header)).toBe(false);
  });

  it("rejects if the body was tampered with after signing", () => {
    const secret = "whsec_test123";
    const timestamp = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(JSON.stringify({ amount: 100 }), secret, timestamp);

    expect(verifyWebhookSignature(JSON.stringify({ amount: 100000 }), secret, header)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyWebhookSignature("{}", "secret", "not-a-valid-header")).toBe(false);
  });

  it("replay protection: rejects a signature older than maxAgeSeconds", () => {
    const body = "{}";
    const secret = "whsec_test123";
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const header = signWebhookPayload(body, secret, oldTimestamp);

    expect(verifyWebhookSignature(body, secret, header, 300)).toBe(false);
  });

  it("accepts a signature within the replay window", () => {
    const body = "{}";
    const secret = "whsec_test123";
    const recentTimestamp = Math.floor(Date.now() / 1000) - 100;
    const header = signWebhookPayload(body, secret, recentTimestamp);

    expect(verifyWebhookSignature(body, secret, header, 300)).toBe(true);
  });
});

describe("generateSigningSecret", () => {
  it("generates a whsec_-prefixed secret, unique per call", () => {
    const a = generateSigningSecret();
    const b = generateSigningSecret();
    expect(a).toMatch(/^whsec_/);
    expect(a).not.toBe(b);
  });
});
