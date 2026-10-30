import { describe, it, expect, beforeAll } from "vitest";
import { createPartnerEmbedLinkToken, verifyPartnerEmbedLinkToken, PARTNER_EMBED_LINK_TTL_SECONDS } from "../embedLink";
import { createPartnerSessionToken } from "../partnerSession";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const payload = { partnerId: "p1", reference: "loc_1", email: "owner@church.test", prefill: { organizationName: "Grace" } };

describe("partner embed link", () => {
  it("round-trips the partner, the organization reference and the person", () => {
    const { token } = createPartnerEmbedLinkToken(payload);
    expect(verifyPartnerEmbedLinkToken(token)).toMatchObject(payload);
  });

  it("gives every link its own random id", () => {
    const a = verifyPartnerEmbedLinkToken(createPartnerEmbedLinkToken(payload).token)!;
    const b = verifyPartnerEmbedLinkToken(createPartnerEmbedLinkToken(payload).token)!;
    expect(a.jti).toMatch(/^[0-9a-f]{32}$/);
    expect(a.jti).not.toBe(b.jti);
  });

  it("expires", () => {
    const now = Date.now();
    const { token } = createPartnerEmbedLinkToken(payload, now);
    expect(verifyPartnerEmbedLinkToken(token, now + (PARTNER_EMBED_LINK_TTL_SECONDS - 5) * 1000)).not.toBeNull();
    expect(verifyPartnerEmbedLinkToken(token, now + (PARTNER_EMBED_LINK_TTL_SECONDS + 5) * 1000)).toBeNull();
  });

  it("rejects a changed payload, junk, and other tokens signed with the same secret", () => {
    const { token } = createPartnerEmbedLinkToken(payload);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), partnerId: "p2" })).toString("base64url");
    expect(verifyPartnerEmbedLinkToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyPartnerEmbedLinkToken("junk")).toBeNull();
    expect(verifyPartnerEmbedLinkToken(undefined)).toBeNull();
    expect(verifyPartnerEmbedLinkToken(createPartnerSessionToken({ partnerUserId: "u", partnerId: "p1", authVersion: 1 }))).toBeNull();
  });
});
