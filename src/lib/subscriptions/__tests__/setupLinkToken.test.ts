import { describe, it, expect } from "vitest";
import { generateSetupLinkToken, hashSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";

describe("generateSetupLinkToken", () => {
  it("produces a raw token and a hash that verifies against it", () => {
    const { token, tokenHash } = generateSetupLinkToken();
    expect(token).toHaveLength(64);
    expect(hashSetupLinkToken(token)).toBe(tokenHash);
  });

  it("never stores the raw token equal to its own hash", () => {
    const { token, tokenHash } = generateSetupLinkToken();
    expect(token).not.toBe(tokenHash);
  });

  it("generates a different token on every call", () => {
    const a = generateSetupLinkToken();
    const b = generateSetupLinkToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("a tampered token hashes to a different value, so lookup by hash rejects it", () => {
    const { token, tokenHash } = generateSetupLinkToken();
    const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
    expect(hashSetupLinkToken(tampered)).not.toBe(tokenHash);
  });
});
