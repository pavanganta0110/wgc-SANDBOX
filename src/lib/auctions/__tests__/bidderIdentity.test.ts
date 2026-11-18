import { describe, it, expect } from "vitest";
import { buildBidderCookie, cleanName, cleanPhone, generateBidderCode, hashBidderCode, hashSessionToken, newSessionToken, normalizeEmail, readBidderCookie, safeEqualHex } from "../bidderIdentity";

describe("bidder identity", () => {
  it("normalizes email and rejects junk", () => {
    expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
  it("cleans names and phones", () => {
    expect(cleanName("  Jane   Q  Giver ")).toBe("Jane Q Giver");
    expect(cleanName("")).toBeNull();
    expect(cleanPhone("(555) 123-4567")).toBe("5551234567");
    expect(cleanPhone("12")).toBeNull();
  });
  it("makes six-digit codes and salts the hash by auction and email", () => {
    expect(generateBidderCode()).toMatch(/^\d{6}$/);
    const a = hashBidderCode("123456", "auc1", "a@x.com");
    expect(a).toBe(hashBidderCode("123456", "auc1", "a@x.com"));
    expect(a).not.toBe(hashBidderCode("123456", "auc2", "a@x.com"));
    expect(a).not.toBe(hashBidderCode("123456", "auc1", "b@x.com"));
  });
  it("compares hashes safely, including different lengths and missing values", () => {
    const a = hashSessionToken("t");
    expect(safeEqualHex(a, hashSessionToken("t"))).toBe(true);
    expect(safeEqualHex(a, hashSessionToken("u"))).toBe(false);
    expect(safeEqualHex(a, "short")).toBe(false);
    expect(safeEqualHex(null, a)).toBe(false);
  });
  it("round-trips the session cookie for one auction only", () => {
    const { token, hash } = newSessionToken();
    const cookie = buildBidderCookie("auc1", "bid1", token).split(";")[0];
    expect(readBidderCookie(`other=1; ${cookie}`, "auc1")).toEqual({ bidderId: "bid1", token });
    expect(readBidderCookie(cookie, "auc2")).toBeNull();
    expect(hashSessionToken(token)).toBe(hash);
    expect(readBidderCookie(null, "auc1")).toBeNull();
    expect(readBidderCookie("wgc_bidder_auc1=nodot", "auc1")).toBeNull();
  });
  it("the cookie is httpOnly and lax", () => {
    const c = buildBidderCookie("auc1", "bid1", "tok");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
  });
});
