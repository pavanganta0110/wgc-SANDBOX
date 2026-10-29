import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { createPartnerSessionToken, verifyPartnerSessionToken, PARTNER_SESSION_MAX_AGE_SECONDS } from "../partnerSession";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "test-secret-test-secret-test-secret-123456";
});

const payload = { partnerUserId: "pu_1", partnerId: "p_1", authVersion: 3 };

describe("partner session token", () => {
  it("round-trips a valid token", () => {
    const token = createPartnerSessionToken(payload);
    expect(verifyPartnerSessionToken(token)).toMatchObject(payload);
  });

  it("rejects a tampered payload", () => {
    const [body, sig] = createPartnerSessionToken(payload).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, partnerId: "p_2", exp: 9999999999 })).toString("base64url");
    expect(verifyPartnerSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyPartnerSessionToken(`${body}.${sig}x`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const issuedAt = Date.now() - (PARTNER_SESSION_MAX_AGE_SECONDS + 60) * 1000;
    expect(verifyPartnerSessionToken(createPartnerSessionToken(payload, issuedAt))).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyPartnerSessionToken("")).toBeNull();
    expect(verifyPartnerSessionToken("abc")).toBeNull();
    expect(verifyPartnerSessionToken("a.b.c")).toBeNull();
  });

  it("is not interchangeable with an organization or admin session token", () => {
    const orgToken = createSessionToken({ userId: "u_1", email: "a@b.co", role: "owner", churchId: "c_1", authVersion: 1 });
    expect(verifyPartnerSessionToken(orgToken)).toBeNull();

    const partnerToken = createPartnerSessionToken(payload);
    expect(verifySessionToken(partnerToken)).toBeNull();
  });

  it("rejects a token signed without the partner context", () => {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    const plainSig = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update(body).digest("base64url");
    expect(verifyPartnerSessionToken(`${body}.${plainSig}`)).toBeNull();
  });
});
