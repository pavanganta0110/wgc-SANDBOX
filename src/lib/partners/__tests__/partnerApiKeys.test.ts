import { describe, it, expect } from "vitest";
import { generatePartnerApiKey, hashPartnerApiKey, partnerKeyEnvironment, partnerKeyPrefixFor } from "../partnerApiKeys";

describe("partner API keys", () => {
  it("labels the environment from the Finix environment, defaulting to test", () => {
    expect(partnerKeyEnvironment("live")).toBe("live");
    expect(partnerKeyEnvironment("PRODUCTION")).toBe("live");
    expect(partnerKeyEnvironment("sandbox")).toBe("test");
    expect(partnerKeyEnvironment(undefined)).toBe("test");
    expect(partnerKeyEnvironment("")).toBe("test");
  });

  it("generates a key that can never be mistaken for an organization key", () => {
    const key = generatePartnerApiKey("test");
    expect(key).toMatch(/^wgc_ptr_test_[A-Za-z0-9_-]{30,}$/);
    expect(key.startsWith("wgc_live_")).toBe(false);
    expect(generatePartnerApiKey("live").startsWith("wgc_ptr_live_")).toBe(true);
    expect(generatePartnerApiKey("test")).not.toBe(key);
  });

  it("hashes one way and the prefix reveals too little to use the key", () => {
    const key = generatePartnerApiKey("test");
    expect(hashPartnerApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPartnerApiKey(key)).not.toContain(key);
    const prefix = partnerKeyPrefixFor(key);
    expect(prefix.endsWith("...")).toBe(true);
    expect(key.length - (prefix.length - 3)).toBeGreaterThan(20);
  });
});
